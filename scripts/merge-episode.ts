/**
 * Server-side episode merge:
 *   1. Fetch the ordered clip list (opening + primary scene videos).
 *   2. Download each clip (Sora-proxy URLs via OpenAI, else direct).
 *   3. Re-encode each clip to a common spec (1280x720 H.264 yuv420p, AAC)
 *      so concat doesn't fail on mismatched streams.
 *   4. Concat with ffmpeg concat demuxer.
 *   5. Upload final MP4 to Vercel Blob.
 *   6. Write the Asset row (entityType=EPISODE, metadata.kind=merged-episode).
 *
 * Usage:
 *   npx tsx scripts/merge-episode.ts <episodeId>
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const EPISODE_ID = process.argv[2];
if (!EPISODE_ID) { console.error("usage: merge-episode.ts <episodeId>"); process.exit(1); }
if (!KEY) { console.error("OPENAI_API_KEY required"); process.exit(1); }
if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error("BLOB_READ_WRITE_TOKEN required"); process.exit(1); }

function log(m: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

(async () => {
  const ep = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: {
      season: { include: { series: { include: { project: true } } } },
      scenes: { orderBy: { sceneNumber: "asc" }, select: { id: true, sceneNumber: true, title: true } },
    },
  });
  if (!ep) { log("episode not found"); return; }
  log(`ep ${ep.episodeNumber} "${ep.title}" · ${ep.scenes.length} scenes`);

  // 1) OPENING
  let opening = await p.seasonOpening.findFirst({
    where: { isSeriesDefault: true, season: { seriesId: ep.season.seriesId }, status: "READY" },
    select: { videoUrl: true },
  });
  if (!opening) {
    opening = await p.seasonOpening.findFirst({
      where: { seasonId: ep.season.id, status: "READY" },
      select: { videoUrl: true },
    });
  }

  // 2) primary scene videos
  const clips: Array<{ url: string; label: string; soraId: string | null }> = [];
  if (opening?.videoUrl) {
    const soraId = opening.videoUrl.match(/id=(video_[^&]+)/)?.[1] ?? null;
    clips.push({ url: opening.videoUrl, label: "opening", soraId });
  }

  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: { in: ep.scenes.map((s) => s.id) }, assetType: "VIDEO", status: "READY" },
    select: { id: true, entityId: true, fileUrl: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const bySceneId = new Map<string, typeof assets[number]>();
  for (const a of assets) {
    const m = (a.metadata as { isPrimary?: boolean } | null) ?? {};
    if (m.isPrimary && !bySceneId.has(a.entityId)) bySceneId.set(a.entityId, a);
  }
  for (const a of assets) {
    if (!bySceneId.has(a.entityId)) bySceneId.set(a.entityId, a);
  }
  for (const s of ep.scenes) {
    const a = bySceneId.get(s.id);
    if (a) {
      const meta = (a.metadata as any) ?? {};
      const soraId = meta.soraVideoId ?? a.fileUrl.match(/id=(video_[^&]+)/)?.[1] ?? null;
      clips.push({ url: a.fileUrl, label: `SC${s.sceneNumber}${s.title ? ` · ${s.title}` : ""}`, soraId });
    } else {
      log(`  ⚠ SC${s.sceneNumber} has no READY primary — skipped`);
    }
  }

  if (clips.length < 2) { log(`only ${clips.length} clips — nothing to merge`); return; }
  log(`clips to merge: ${clips.length}`);
  for (const c of clips) log(`  · ${c.label} (${c.soraId ?? c.url.slice(0, 60)})`);

  // 3) Download each clip
  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");
  const { execSync } = await import("child_process");
  const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string };
  const ffmpegBin = ffmpegInstaller.path;
  try { await fs.chmod(ffmpegBin, 0o755); } catch {}

  const ts = Date.now();
  const dir = path.join(os.tmpdir(), `merge-${ts}`);
  await fs.mkdir(dir, { recursive: true });
  log(`tmp dir: ${dir}`);

  const normalized: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const raw = path.join(dir, `raw-${i}.mp4`);
    const norm = path.join(dir, `norm-${i}.mp4`);

    // Download
    let buf: Buffer;
    if (c.soraId) {
      const r = await fetch(`https://api.openai.com/v1/videos/${c.soraId}/content`, { headers: { Authorization: `Bearer ${KEY}` } });
      if (!r.ok) { log(`  ⚠ skip ${c.label}: OpenAI ${r.status}`); continue; }
      buf = Buffer.from(await r.arrayBuffer());
    } else {
      const r = await fetch(c.url);
      if (!r.ok) { log(`  ⚠ skip ${c.label}: ${r.status}`); continue; }
      buf = Buffer.from(await r.arrayBuffer());
    }
    await fs.writeFile(raw, buf);
    log(`  ⬇ ${c.label}: ${Math.round(buf.length / 1024)}KB`);

    // Normalize to common spec (H.264 yuv420p, AAC 48k, 1280x720, 30fps, ~5Mbps)
    execSync(`"${ffmpegBin}" -i "${raw}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=30" -c:v libx264 -preset fast -b:v 5M -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart "${norm}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
    await fs.access(norm);
    normalized.push(norm);
    log(`  ✓ normalized`);
  }

  if (normalized.length < 2) { log("not enough normalized clips"); return; }

  // 4) Concat
  const listTxt = path.join(dir, "list.txt");
  await fs.writeFile(listTxt, normalized.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const out = path.join(dir, "merged.mp4");
  log(`concat ${normalized.length} clips…`);
  execSync(`"${ffmpegBin}" -f concat -safe 0 -i "${listTxt}" -c copy -movflags +faststart "${out}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
  const outBuf = await fs.readFile(out);
  log(`  ✓ merged: ${Math.round(outBuf.length / 1024 / 1024)}MB`);

  // Probe duration
  let durationSec = 0;
  try {
    const probe = execSync(`"${ffmpegBin}" -i "${out}" 2>&1 | grep Duration`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const m = probe.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) durationSec = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  } catch {}
  log(`  duration: ${Math.round(durationSec)}s`);

  // 5) Upload to Blob
  const { put } = await import("@vercel/blob");
  const blob = await put(`merged-episodes/ep-${ep.episodeNumber}-${ts}.mp4`, outBuf, { access: "public", contentType: "video/mp4" });
  log(`  ↗ uploaded: ${blob.url}`);

  // 6) Asset row
  const asset = await p.asset.create({
    data: {
      projectId: ep.season.series.projectId,
      entityType: "EPISODE", entityId: ep.id, assetType: "VIDEO",
      fileUrl: blob.url, mimeType: "video/mp4", status: "READY",
      durationSeconds: Math.round(durationSec),
      metadata: {
        kind: "merged-episode",
        clipCount: normalized.length,
        sourceClips: clips.map((c) => ({ label: c.label, soraId: c.soraId })),
        mergedAt: new Date().toISOString(),
      } as any,
    },
  });
  log(`  ✓ asset ${asset.id}`);

  // Cleanup
  for (const n of normalized) await fs.unlink(n).catch(() => {});
  await fs.unlink(out).catch(() => {});
  await fs.unlink(listTxt).catch(() => {});
  try { await fs.rm(dir, { recursive: true }); } catch {}

  log(`\n━━━ MERGE COMPLETE ━━━\nEpisode video: ${blob.url}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
