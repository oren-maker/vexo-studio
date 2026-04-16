import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // SC01 has 4 video assets but only 3 GENERATION CostEntry rows.
  // Find scene-video assets without a matching CostEntry.
  const sceneId = "cmo1lzrhf00018kuzpsm215va";
  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: sceneId, assetType: "VIDEO", status: "READY" },
    orderBy: { createdAt: "asc" },
  });
  const costs = await p.costEntry.findMany({
    where: { entityType: "SCENE", entityId: sceneId, costCategory: "GENERATION" },
  });
  console.log(`Assets: ${assets.length}, GENERATION costs: ${costs.length}`);
  const missing = assets.length - costs.length;
  if (missing > 0) {
    const ep = await p.episode.findFirst({ where: { scenes: { some: { id: sceneId } } }, include: { season: { include: { series: true } } } });
    const projectId = ep?.season.series.projectId;
    for (let i = 0; i < missing; i++) {
      await p.costEntry.create({
        data: {
          entityType: "SCENE", entityId: sceneId,
          costCategory: "GENERATION",
          description: `Scene video · sora-2 · 20s (backfill-2)`,
          unitCost: 2, quantity: 1, totalCost: 2,
          sourceType: "BACKFILL",
          projectId: projectId ?? null,
          createdAt: assets[i]?.createdAt ?? new Date(),
        },
      });
      console.log(`+$2 (video ${i + 1})`);
    }
  }
  // Verify
  const after = await p.costEntry.aggregate({ where: { entityType: "SCENE", entityId: sceneId }, _sum: { totalCost: true } });
  console.log(`\nTotal now: $${after._sum.totalCost?.toFixed(4)}`);
  await p.$disconnect();
})();
