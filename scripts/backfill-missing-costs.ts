/**
 * Backfill CostEntry rows for video assets that were created by local
 * scripts today (remix-with-title-card, remix-v2-test, remix-specific-source)
 * but bypassed chargeUsd(). The scene page sums from CostEntry, so those
 * $8 of real Sora spend went invisible.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCENE_ID = process.argv[2] || "cmo2ayw3d0001d2620skafbia";

(async () => {
  const scene = await p.scene.findUnique({
    where: { id: SCENE_ID },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  if (!scene) { console.error("not found"); return; }
  const projectId = scene.episode?.season?.series?.projectId;
  if (!projectId) { console.error("no projectId"); return; }
  const org = await p.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  const organizationId = org?.organizationId;
  if (!organizationId) { console.error("no orgId"); return; }

  const openaiProvider = await p.provider.findFirst({
    where: { organizationId, name: { contains: "OpenAI", mode: "insensitive" } },
    select: { id: true },
  });

  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: SCENE_ID, assetType: "VIDEO" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, fileUrl: true, metadata: true },
  });

  const costs = await p.costEntry.findMany({
    where: { entityType: "SCENE", entityId: SCENE_ID, costCategory: "GENERATION" },
    select: { createdAt: true, totalCost: true },
  });

  console.log(`${assets.length} VIDEO assets · ${costs.length} GENERATION cost entries`);

  // Strategy: for each asset that has costUsd in metadata but no matching
  // CostEntry within ±10 minutes of its createdAt, insert a CostEntry.
  let added = 0;
  for (const a of assets) {
    const m: any = a.metadata ?? {};
    if (typeof m.costUsd !== "number") continue;
    const near = costs.find((c) =>
      Math.abs(c.createdAt.getTime() - a.createdAt.getTime()) < 10 * 60 * 1000 &&
      Math.abs(c.totalCost - m.costUsd) < 0.01,
    );
    if (near) {
      console.log(`  ✓ asset ${a.id.slice(-8)} already has matching CostEntry (${near.createdAt.toISOString().slice(11, 19)} · $${near.totalCost})`);
      continue;
    }
    const desc = m.kind && String(m.kind).includes("remix")
      ? `Sora remix · ${m.model ?? "sora-2"} · ${m.durationSeconds ?? 20}s (backfilled)`
      : `Scene video · ${m.model ?? "sora-2"} · ${m.durationSeconds ?? 20}s (backfilled)`;
    await p.costEntry.create({
      data: {
        projectId,
        providerId: openaiProvider?.id ?? null,
        entityType: "SCENE",
        entityId: scene.id,
        costCategory: "GENERATION",
        description: desc,
        unitCost: m.costUsd,
        quantity: 1,
        totalCost: m.costUsd,
        sourceType: "MANUAL",
        createdAt: a.createdAt,
      },
    });
    console.log(`  + added CostEntry for asset ${a.id.slice(-8)} · ${desc} · $${m.costUsd}`);
    added++;
  }
  console.log(`\n${added} CostEntry rows backfilled`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
