import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const byEngine = await p.apiUsage.groupBy({ by: ["engine"], _count: true, _sum: { usdCost: true } });
  console.log("ENGINES:");
  for (const e of byEngine) console.log(`  engine=${JSON.stringify(e.engine)} count=${e._count} usd=${e._sum.usdCost}`);
  const byOp = await p.apiUsage.groupBy({ by: ["operation"], _count: true });
  console.log("\nOPS:");
  for (const o of byOp) console.log(`  op=${JSON.stringify(o.operation)} count=${o._count}`);
  await p.$disconnect();
})();
