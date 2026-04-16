import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const openings = await p.seasonOpening.findMany({
    include: { season: { include: { series: { select: { title: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  for (const o of openings) {
    console.log(`\n=== ${o.season.series.title} · S${o.season.seasonNumber} ===`);
    console.log(`id=${o.id}`);
    console.log(`model=${o.model} · duration=${o.duration}s · aspect=${o.aspectRatio}`);
    console.log(`status=${o.status}`);
    console.log(`falRequestId=${o.falRequestId ?? "(none)"}`);
    console.log(`provider=${o.provider ?? "(none)"}`);
    console.log(`updatedAt=${o.updatedAt.toISOString()}`);
    console.log(`videoUrl=${o.videoUrl ?? "(none yet)"}`);
  }
  // Also check recent assets tied to these openings
  const recentAssets = await p.asset.findMany({
    where: { entityType: { in: ["SEASON_OPENING"] } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, entityId: true, status: true, fileUrl: true, createdAt: true, metadata: true },
  });
  console.log(`\nRecent SEASON_OPENING assets:`);
  for (const a of recentAssets) {
    console.log(`  ${a.status} — ${a.id} — ${a.fileUrl.slice(0, 80)}... — ${a.createdAt.toISOString()}`);
    console.log(`     meta: ${JSON.stringify(a.metadata).slice(0, 200)}`);
  }
  await p.$disconnect();
})();
