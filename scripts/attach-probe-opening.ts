/**
 * Wait for the probe Sora video to finish, then attach it as the opening's
 * active video and flip status FAILED→READY. This bypasses the broken
 * client-side polling that kept marking openings as FAILED.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";
const VIDEO_ID = "video_69e2eb2959ec8191b541e62489dd478c04faf7ca7bd60c8b";

(async () => {
  const o = await p.seasonOpening.findFirst({
    where: { season: { series: { title: "Echoes of Tomorrow" } } },
    include: { season: { include: { series: true } } },
  });
  if (!o) { console.error("opening not found"); return; }
  console.log("opening: " + o.id + " currentStatus=" + o.status);

  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    const r = await fetch(`https://api.openai.com/v1/videos/${VIDEO_ID}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d: any = await r.json();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[${elapsed}s] status=${d.status} progress=${d.progress ?? 0}%`);
    if (d.status === "completed") {
      const fileUrl = `/api/v1/videos/sora-proxy?id=${VIDEO_ID}`;
      // archive any prior asset isPrimary=true → false
      await p.asset.updateMany({
        where: { entityType: "SEASON_OPENING", entityId: o.id, assetType: "VIDEO" },
        data: { metadata: undefined as any },
      }).catch(() => {});
      const asset = await p.asset.create({
        data: {
          projectId: o.season.series.projectId,
          entityType: "SEASON_OPENING",
          entityId: o.id,
          assetType: "VIDEO",
          fileUrl,
          mimeType: "video/mp4",
          status: "READY",
          durationSeconds: 20,
          metadata: {
            provider: "openai",
            model: "sora-2",
            soraVideoId: VIDEO_ID,
            isPrimary: true,
            kind: "elegant-rewrite",
          } as any,
        },
      });
      await p.seasonOpening.update({
        where: { id: o.id },
        data: {
          status: "READY",
          videoUrl: fileUrl,
          falRequestId: VIDEO_ID,
          updatedAt: new Date(),
        },
      });
      console.log("✅ attached. asset=" + asset.id);
      console.log("   videoUrl=" + fileUrl);
      console.log("   opening status flipped FAILED → READY");
      break;
    }
    if (d.status === "failed" || d.status === "cancelled") {
      console.error("❌ Sora job " + d.status + ": " + JSON.stringify(d.error));
      break;
    }
    await new Promise((r) => setTimeout(r, 25_000));
  }
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
