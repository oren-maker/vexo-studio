import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const o = await p.seasonOpening.findFirst({ where: { season: { series: { title: "Echoes of Tomorrow" } } } });
  if (!o) { console.log("no opening"); return; }
  console.log("opening:");
  console.log("  id=" + o.id);
  console.log("  model=" + o.model);
  console.log("  status=" + o.status);
  console.log("  falRequestId=" + o.falRequestId);
  console.log("  videoUrl=" + (o.videoUrl ?? "(none)"));
  console.log("  updated=" + o.updatedAt.toISOString());
  const assets = await p.asset.findMany({
    where: { entityType: "SEASON_OPENING", entityId: o.id, assetType: "VIDEO" },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  console.log("\nrecent video assets (" + assets.length + "):");
  for (const a of assets) {
    const m = a.metadata as any;
    console.log("  " + a.createdAt.toISOString() + " " + a.status + " soraId=" + (m?.soraVideoId ?? "?"));
    if (m?.error) console.log("    error: " + JSON.stringify(m.error).slice(0, 200));
    if (m?.errorMessage) console.log("    errorMessage: " + m.errorMessage);
  }
  const costs = await p.costEntry.findMany({
    where: { entityType: "SEASON_OPENING", entityId: o.id },
    orderBy: { createdAt: "desc" }, take: 10,
  });
  console.log("\nrecent cost entries (" + costs.length + "):");
  for (const c of costs) {
    console.log("  " + c.createdAt.toISOString() + " $" + c.usdCost.toFixed(3) + " " + (c.description?.slice(0, 80) ?? ""));
  }
  await p.$disconnect();
})();
