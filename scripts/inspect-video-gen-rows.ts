import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // Pull all rows with engine="gemini-video" or model containing "veo"/"sora"
  const rows = await p.apiUsage.findMany({
    where: {
      OR: [{ engine: "gemini-video" }, { model: { contains: "veo" } }, { model: { contains: "sora" } }],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, engine: true, model: true, operation: true, usdCost: true, sourceId: true, meta: true, createdAt: true },
  });
  console.log(`=== ${rows.length} rows ===`);
  for (const r of rows) {
    const meta = (r.meta as any) || {};
    console.log(`${r.createdAt.toISOString().slice(0, 16)} · engine=${r.engine} · model=${r.model} · op=${r.operation} · $${r.usdCost.toFixed(4)} · meta.engine=${meta.engine || "—"} · src=${r.sourceId?.slice(-6) || "—"}`);
  }

  console.log("\n=== Engine totals (all rows) ===");
  const byEngine = await p.apiUsage.groupBy({ by: ["engine"], _sum: { usdCost: true }, _count: true });
  for (const e of byEngine) console.log(`${e.engine}: $${(e._sum.usdCost || 0).toFixed(4)} · ${e._count} calls`);

  console.log("\n=== Models with non-zero cost ===");
  const byModel = await p.apiUsage.groupBy({ by: ["model"], _sum: { usdCost: true }, _count: true, where: { usdCost: { gt: 0 } } });
  for (const m of byModel.sort((a, b) => (b._sum.usdCost || 0) - (a._sum.usdCost || 0))) {
    console.log(`${m.model}: $${(m._sum.usdCost || 0).toFixed(4)} · ${m._count} calls`);
  }
  await p.$disconnect();
})();
