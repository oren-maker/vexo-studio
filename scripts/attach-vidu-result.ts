import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const FAL = process.env.FAL_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";
const ID = "019d9e7a-f156-7a63-b4cd-11f7cfcd0048";

(async () => {
  const r = await fetch(`https://queue.fal.run/fal-ai/vidu-q1/requests/${ID}`, { headers: { Authorization: `Key ${FAL}` } });
  const d: any = await r.json();
  console.log(JSON.stringify(d, null, 2).slice(0, 800));
  const videoUrl = d?.video?.url ?? d?.output?.video?.url ?? null;
  if (!videoUrl) { console.error("no video url"); return; }
  console.log("\nvideoUrl=" + videoUrl);

  const o = await p.seasonOpening.findFirst({
    where: { season: { series: { title: "Echoes of Tomorrow" } } },
    include: { season: { include: { series: true } } },
  });
  if (!o) return;
  await p.asset.create({
    data: {
      projectId: o.season.series.projectId,
      entityType: "SEASON_OPENING", entityId: o.id, assetType: "VIDEO",
      fileUrl: videoUrl, mimeType: "video/mp4", status: "READY", durationSeconds: 8,
      metadata: { provider: "fal", model: "vidu-q1", costUsd: 0.64, kind: "vidu-cast-opening", refCount: 4, falRequestId: ID } as any,
    },
  });
  await p.seasonOpening.update({
    where: { id: o.id },
    data: { status: "READY", videoUrl, videoUri: ID },
  });
  console.log("✅ attached + flipped READY");
  await p.$disconnect();
})();
