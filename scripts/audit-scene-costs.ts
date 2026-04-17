import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCENE_ID = process.argv[2] || "cmo2ayw3d0001d2620skafbia";
(async () => {
  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: SCENE_ID, assetType: "VIDEO" },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, fileUrl: true, createdAt: true, metadata: true },
  });
  console.log(`━━━ ${assets.length} VIDEO assets on scene ━━━\n`);
  let total = 0;
  for (const a of assets) {
    const m: any = a.metadata ?? {};
    const sid = (a.fileUrl.match(/id=(video_[^&]+)/) || [])[1]?.slice(-12) ?? "—";
    console.log(`${a.createdAt.toISOString().slice(5, 16)} · ${a.status.padEnd(7)} · sora=${sid} · cost=$${m.costUsd ?? "?"} · kind=${m.kind ?? "—"}`);
    if (typeof m.costUsd === "number") total += m.costUsd;
  }
  console.log(`\n━━━ sum of costUsd from metadata: $${total.toFixed(4)} ━━━`);

  // CostEntry records for the scene
  const costs = await p.costEntry.findMany({
    where: { entityType: "SCENE", entityId: SCENE_ID },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, costCategory: true, description: true, totalCost: true },
  });
  console.log(`\n━━━ ${costs.length} CostEntry rows ━━━`);
  let costTotal = 0;
  for (const c of costs) {
    console.log(`${c.createdAt.toISOString().slice(5, 16)} · ${c.costCategory.padEnd(10)} · $${c.totalCost.toFixed(4)} · ${c.description?.slice(0, 60)}`);
    costTotal += c.totalCost;
  }
  console.log(`\n━━━ CostEntry total: $${costTotal.toFixed(4)} ━━━`);
  await p.$disconnect();
})().catch((e) => console.error("ERR:", e.message));
