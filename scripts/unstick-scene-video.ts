/**
 * Manually finalize a Sora-generated scene video that already completed
 * in Sora but the scene GET polling missed it.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
(async () => {
  const scenes = await p.scene.findMany({
    where: { episodeId: EPISODE_ID, status: "VIDEO_GENERATING" },
    include: { episode: { include: { season: { include: { series: { select: { projectId: true } } } } } } },
  });
  for (const s of scenes) {
    const mem: any = s.memoryContext ?? {};
    const pending = mem.pendingVideoJob;
    if (!pending) continue;
    const proxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(pending.jobId)}`;
    const projectId = s.episode?.season.series.projectId;
    if (!projectId) continue;
    await p.asset.create({
      data: {
        projectId, entityType: "SCENE", entityId: s.id, assetType: "VIDEO",
        fileUrl: proxyUrl, mimeType: "video/mp4", status: "READY",
        metadata: { provider: pending.provider, model: pending.model, durationSeconds: pending.durationSeconds } as any,
      },
    });
    const { pendingVideoJob: _p, ...rest } = mem;
    await p.scene.update({
      where: { id: s.id },
      data: { status: "VIDEO_REVIEW", memoryContext: rest as object },
    });
    console.log(`✓ SC${s.sceneNumber} "${s.title}" → VIDEO_REVIEW · ${proxyUrl}`);
  }
  await p.$disconnect();
})();
