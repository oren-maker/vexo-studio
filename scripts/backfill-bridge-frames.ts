/**
 * Re-extract the 4 bridge frames for a specific scene and replace the
 * single bridgeFrameUrl in memoryContext with the array. Uses the same
 * pipeline as the deployed approve route so a scene approved BEFORE the
 * 4-frame feature still gets 4 frames.
 *
 * Usage:
 *   DATABASE_URL=... OPENAI_API_KEY=... BLOB_READ_WRITE_TOKEN=... \
 *     npx tsx scripts/backfill-bridge-frames.ts <sceneId>
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCENE_ID = process.argv[2];
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
if (!SCENE_ID) { console.error("usage: backfill-bridge-frames.ts <sceneId>"); process.exit(1); }
if (!KEY) { console.error("OPENAI_API_KEY missing"); process.exit(1); }
if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error("BLOB_READ_WRITE_TOKEN missing"); process.exit(1); }

(async () => {
  const scene = await p.scene.findUnique({
    where: { id: SCENE_ID },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  if (!scene) { console.error("scene not found"); return; }

  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: scene.id, assetType: "VIDEO", status: "READY" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { fileUrl: true, metadata: true },
  });
  const primary = assets.find((a) => (a.metadata as any)?.isPrimary) ?? assets[0];
  if (!primary) { console.error("no READY video asset"); return; }
  const meta: any = primary.metadata ?? {};
  const soraId = meta.soraVideoId ?? primary.fileUrl.match(/[?&]id=(video_[^&]+)/)?.[1];
  if (!soraId) { console.error("no soraVideoId"); return; }
  console.log(`source: ${soraId}`);

  // Download MP4
  const res = await fetch(`https://api.openai.com/v1/videos/${soraId}/content`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) { console.error(`OpenAI video fetch ${res.status}`); return; }
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`downloaded ${Math.round(buf.length / 1024)}KB`);

  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");
  const { execSync } = await import("child_process");
  const ts = Date.now();
  const tmp = path.join(os.tmpdir(), `backfill-${ts}.mp4`);
  await fs.writeFile(tmp, buf);

  const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string };
  const ffmpegBin = ffmpegInstaller.path;
  try { await fs.chmod(ffmpegBin, 0o755); } catch { /* ignore */ }

  const windows = [
    { start: 4, label: "t-4s" },
    { start: 3, label: "t-3s" },
    { start: 2, label: "t-2s" },
    { start: 1, label: "t-1s" },
  ];
  const framePaths: string[] = [];
  for (const w of windows) {
    const out = path.join(os.tmpdir(), `backfill-${ts}-${w.label}.jpg`);
    // First try with keyframe-only (sharpest). If that window has no
    // keyframe (can happen near end-of-clip), retry without the filter.
    try {
      execSync(
        `"${ffmpegBin}" -sseof -${w.start} -skip_frame nokey -i "${tmp}" -vf "thumbnail=30,unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${out}" -y`,
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      // Verify the file exists
      await fs.access(out);
    } catch {
      execSync(
        `"${ffmpegBin}" -sseof -${w.start} -i "${tmp}" -vf "unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${out}" -y`,
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      await fs.access(out);
    }
    framePaths.push(out);
    console.log(`  ✓ extracted ${w.label}`);
  }

  const sharp = (await import("sharp")).default;
  const { put } = await import("@vercel/blob");
  const urls: string[] = [];
  for (let i = 0; i < framePaths.length; i++) {
    const raw = await fs.readFile(framePaths[i]);
    const resized = await sharp(raw).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
    const blob = await put(`bridge-frames/scene-${ts}-${i + 1}.jpg`, resized, {
      access: "public",
      contentType: "image/jpeg",
    });
    urls.push(blob.url);
    console.log(`  ↗ uploaded ${i + 1}: ${blob.url}`);
  }

  // Cleanup tmp files
  await fs.unlink(tmp).catch(() => {});
  for (const fp of framePaths) await fs.unlink(fp).catch(() => {});

  // Update DB
  const thisMem: any = scene.memoryContext ?? {};
  await p.scene.update({
    where: { id: scene.id },
    data: {
      memoryContext: {
        ...thisMem,
        bridgeFrameUrl: urls[urls.length - 1],
        bridgeFrameUrls: urls,
      } as any,
    },
  });
  console.log(`✓ saved ${urls.length} bridge frames on scene`);

  // Propagate canonical to next scene
  if (scene.episodeId && scene.sceneNumber != null) {
    const next = await p.scene.findFirst({
      where: { episodeId: scene.episodeId, sceneNumber: scene.sceneNumber + 1 },
    });
    if (next) {
      const nm: any = next.memoryContext ?? {};
      await p.scene.update({
        where: { id: next.id },
        data: { memoryContext: { ...nm, seedImageUrl: urls[urls.length - 1] } as any },
      });
      console.log(`✓ propagated to next scene ${next.id.slice(-8)} as seedImageUrl`);
    }
  }

  await (p as any).sceneLog.create({
    data: {
      sceneId: scene.id,
      action: "bridge_frames_backfilled",
      actor: "system:backfill-bridge-frames",
      actorName: "Bridge frames backfill",
      details: { count: urls.length, sourceSoraId: soraId, urls },
    },
  }).catch(() => {});

  console.log(`\n✅ done · ${urls.length} frames saved`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
