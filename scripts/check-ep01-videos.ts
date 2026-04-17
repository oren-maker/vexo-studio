import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const scenes = await p.scene.findMany({
    where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6" },
    orderBy: { sceneNumber: "asc" },
    select: { id: true, sceneNumber: true, title: true, status: true, memoryContext: true },
  });
  for (const s of scenes) {
    const mem: any = s.memoryContext ?? {};
    const pending = mem.pendingVideoJob;
    const assets = await p.asset.findMany({ where: { entityType: "SCENE", entityId: s.id, assetType: "VIDEO" }, select: { status: true, fileUrl: true, createdAt: true } });
    const hasSheet = !!mem.directorSheet;
    console.log(`SC${String(s.sceneNumber).padStart(2, "0")} "${s.title}" · ${s.status} · sheet=${hasSheet ? "✓" : "✗"} · videos=${assets.length}${pending ? ` · PENDING ${pending.provider}/${pending.jobId?.slice(0, 12)}` : ""}`);
  }
  await p.$disconnect();
})();
