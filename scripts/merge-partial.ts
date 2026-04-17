/**
 * Partial episode merge — pick N scenes and optionally the opening.
 *
 * Usage:
 *   npx tsx scripts/merge-partial.ts <episodeId> <sceneN1,sceneN2,...> [--no-opening]
 *
 * Example: opening + SC1 + SC2 + SC3:
 *   npx tsx scripts/merge-partial.ts cmny2i5k2000lu7yrxy2s63r6 1,2,3
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const EPISODE_ID = process.argv[2];
const SCENES_ARG = process.argv[3] ?? "";
const NO_OPENING = process.argv.includes("--no-opening");
if (!EPISODE_ID || !SCENES_ARG) { console.error("usage: merge-partial.ts <episodeId> <sceneNums csv> [--no-opening]"); process.exit(1); }
if (!KEY || !process.env.BLOB_READ_WRITE_TOKEN) { console.error("OPENAI + BLOB required"); process.exit(1); }
const SCENE_NUMS = SCENES_ARG.split(",").map(Number).filter((n) => !isNaN(n));

function log(m: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

(async () => {
  const ep = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: {
      season: { include: { series: { include: { project: true } } } },
      scenes: { where: { sceneNumber: { in: SCENE_NUMS } }, orderBy: { sceneNumber: "asc" }, select: { id: true, sceneNumber: true, title: true } },
    },
  });
  if (!ep) { log("episode not found"); return; }
  log(`ep ${ep.episodeNumber} · picking ${ep.scenes.length}/${SCENE_NUMS.length} scenes`);

  const clips: Array<{ url: string; label: string; soraId: string | null }> = [];

  if (!NO_OPENING) {
    let op = await p.seasonOpening.findFirst({ where: { isSeriesDefault: true, season: { seriesId: ep.season.seriesId }, status: "READY" } });
    if (!op) op = await p.seasonOpening.findFirst({ where: { seasonId: ep.season.id, status: "READY" } });
    if (op?.videoUri) {
      clips.push({ url: op.videoUrl!, label: "opening", soraId: op.videoUri });
      log(`  ✓ opening: ${op.videoUri.slice(-12)}`);
    } else {
      log(`  ⚠ no READY opening`);
    }
  }

  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: { in: ep.scenes.map((s) => s.id) }, assetType: "VIDEO", status: "READY" },
    select: { entityId: true, fileUrl: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const bySceneId = new Map<string, typeof assets[number]>();
  for (const a of assets) {
    const m: any = a.metadata ?? {};
    if (m.isPrimary && !bySceneId.has(a.entityId)) bySceneId.set(a.entityId, a);
  }
  for (const a of assets) if (!bySceneId.has(a.entityId)) bySceneId.set(a.entityId, a);

  for (const s of ep.scenes) {
    const a = bySceneId.get(s.id);
    if (a) {
      const m: any = a.metadata ?? {};
      const soraId = m.soraVideoId ?? a.fileUrl.match(/id=(video_[^&]+)/)?.[1] ?? null;
      clips.push({ url: a.fileUrl, label: `SC${s.sceneNumber}${s.title ? ` · ${s.title}` : ""}`, soraId });
      log(`  ✓ SC${s.sceneNumber}: ${soraId?.slice(-12) ?? "direct"}`);
    } else {
      log(`  ⚠ SC${s.sceneNumber}: no READY`);
    }
  }

  if (clips.length < 2) { log(`only ${clips.length} clips, need ≥2`); return; }

  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");
  const { execSync } = await import("child_process");
  const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string };
  const ffmpegBin = ffmpegInstaller.path;
  try { await fs.chmod(ffmpegBin, 0o755); } catch {}

  const ts = Date.now();
  const dir = path.join(os.tmpdir(), `merge-partial-${ts}`);
  await fs.mkdir(dir, { recursive: true });

  const normalized: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const raw = path.join(dir, `raw-${i}.mp4`);
    const norm = path.join(dir, `norm-${i}.mp4`);

    let buf: Buffer;
    if (c.soraId) {
      const r = await fetch(`https://api.openai.com/v1/videos/${c.soraId}/content`, { headers: { Authorization: `Bearer ${KEY}` } });
      if (!r.ok) { log(`  ⚠ skip ${c.label}: ${r.status}`); continue; }
      buf = Buffer.from(await r.arrayBuffer());
    } else {
      const r = await fetch(c.url);
      if (!r.ok) { log(`  ⚠ skip ${c.label}: ${r.status}`); continue; }
      buf = Buffer.from(await r.arrayBuffer());
    }
    await fs.writeFile(raw, buf);
    log(`  ⬇ ${c.label}: ${Math.round(buf.length / 1024)}KB`);

    execSync(`"${ffmpegBin}" -i "${raw}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=30" -c:v libx264 -preset fast -b:v 5M -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart "${norm}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
    await fs.access(norm);
    normalized.push(norm);
  }

  if (normalized.length < 2) { log("not enough normalized"); return; }

  const listTxt = path.join(dir, "list.txt");
  await fs.writeFile(listTxt, normalized.map((pp) => `file '${pp.replace(/'/g, "'\\''")}'`).join("\n"));
  const out = path.join(dir, "merged.mp4");
  log(`concat ${normalized.length} clips…`);
  execSync(`"${ffmpegBin}" -f concat -safe 0 -i "${listTxt}" -c copy -movflags +faststart "${out}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
  const outBuf = await fs.readFile(out);
  log(`  ✓ merged ${Math.round(outBuf.length / 1024 / 1024)}MB`);

  let durationSec = 0;
  try {
    const probe = execSync(`"${ffmpegBin}" -i "${out}" 2>&1 | grep Duration`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const m = probe.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (m) durationSec = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  } catch {}
  log(`  duration: ${Math.round(durationSec)}s`);

  const { put } = await import("@vercel/blob");
  const label = (NO_OPENING ? "" : "op-") + SCENE_NUMS.join("_");
  const blob = await put(`merged-episodes/partial-${label}-${ts}.mp4`, outBuf, { access: "public", contentType: "video/mp4" });
  log(`  ↗ ${blob.url}`);

  // Cleanup tmp
  for (const n of normalized) await fs.unlink(n).catch(() => {});
  await fs.unlink(out).catch(() => {});
  await fs.unlink(listTxt).catch(() => {});
  try { await fs.rm(dir, { recursive: true }); } catch {}

  log(`\n━━━ DONE ━━━`);
  log(`clips: ${clips.map((c) => c.label).join(" → ")}`);
  log(`URL: ${blob.url}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
