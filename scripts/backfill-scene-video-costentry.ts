/**
 * generate-video wrote ApiUsage but NOT CostEntry for Sora scene videos.
 * The scene AI-cost card reads CostEntry → showed $0 for them. Backfill.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", assetType: "VIDEO", status: "READY" },
    select: { id: true, entityId: true, projectId: true, metadata: true, createdAt: true },
  });
  let added = 0;
  for (const a of assets) {
    const m: any = a.metadata ?? {};
    if (m.provider !== "openai") continue;
    const dur = Number(m.durationSeconds ?? 0);
    if (!dur) continue;
    const costUsd = +(0.10 * dur).toFixed(4);
    const existing = await p.costEntry.findFirst({
      where: { entityType: "SCENE", entityId: a.entityId, description: { contains: "Scene video" } },
    });
    if (existing) continue;
    const openai = await p.provider.findFirst({ where: { name: { contains: "openai", mode: "insensitive" } } });
    await p.costEntry.create({
      data: {
        entityType: "SCENE", entityId: a.entityId,
        costCategory: "GENERATION",
        description: `Scene video · sora-2 · ${dur}s (backfill)`,
        unitCost: costUsd, quantity: 1, totalCost: costUsd,
        sourceType: "BACKFILL",
        projectId: a.projectId,
        providerId: openai?.id ?? null,
        createdAt: a.createdAt,
      },
    });
    added++;
    console.log(`add ${a.entityId.slice(-8)} · ${dur}s · $${costUsd}`);
  }
  console.log(`\n✅ Added ${added} CostEntry rows.`);
  await p.$disconnect();
})();
