import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const s = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 } });
  if (!s) { console.log("no scene"); return; }
  console.log(`Scene: ${s.id} · SC${s.sceneNumber} "${s.title}"`);
  const costs = await p.costEntry.findMany({ where: { entityType: "SCENE", entityId: s.id }, orderBy: { createdAt: "asc" } });
  console.log(`CostEntry rows: ${costs.length}`);
  let total = 0;
  for (const c of costs) { total += c.totalCost; console.log(`  ${c.costCategory.padEnd(12)} $${c.totalCost.toFixed(4)} · ${c.description}`); }
  console.log(`  TOTAL: $${total.toFixed(4)}`);
  const assets = await p.asset.findMany({ where: { entityType: "SCENE", entityId: s.id, assetType: "VIDEO", status: "READY" } });
  console.log(`\nVideo assets: ${assets.length}`);
  for (const a of assets) { const m: any = a.metadata ?? {}; console.log(`  ${a.createdAt.toISOString().slice(0, 16)} · ${m.model ?? "?"} · ${m.durationSeconds ?? "?"}s · costUsd=${m.costUsd ?? "—"}`); }
  await p.$disconnect();
})();
