import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
(async () => {
  const scenes = await p.scene.findMany({
    where: { episodeId: EPISODE_ID },
    orderBy: { sceneNumber: "asc" },
    select: { id: true, sceneNumber: true, title: true, status: true, memoryContext: true, updatedAt: true },
  });
  for (const s of scenes) {
    const mem: any = s.memoryContext ?? {};
    const p = mem.pendingVideoJob;
    const assets = await (new PrismaClient()).asset.findMany({
      where: { entityType: "SCENE", entityId: s.id, assetType: "VIDEO", status: "READY" },
      orderBy: { createdAt: "desc" }, take: 3,
      select: { fileUrl: true, createdAt: true, metadata: true },
    });
    if (s.status.startsWith("VIDEO") || p || assets.length > 0) {
      const now = Date.now();
      const submittedAtStr = (s.memoryContext as any)?.pendingVideoJob?.submittedAt;
      const elapsedSec = submittedAtStr ? Math.round((now - new Date(submittedAtStr).getTime()) / 1000) : 0;
      console.log(`SC${String(s.sceneNumber).padStart(2, "0")} "${s.title}"`);
      console.log(`  status=${s.status} · updated=${s.updatedAt.toISOString()}`);
      if (p) console.log(`  pending: provider=${p.provider} · jobId=${p.jobId} · elapsed=${elapsedSec}s`);
      else console.log(`  (no pending job)`);
      for (const a of assets) console.log(`  asset READY: ${a.createdAt.toISOString()} · ${a.fileUrl.slice(0, 80)}`);
    }
  }
  await p.$disconnect();
})();
