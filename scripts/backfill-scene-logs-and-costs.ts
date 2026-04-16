/**
 * Backfill SceneLog + CostEntry for past AI operations on EP01 scenes that
 * happened before we wired up the logging/charging.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";

(async () => {
  const scenes = await p.scene.findMany({
    where: { episodeId: EPISODE_ID },
    orderBy: { sceneNumber: "asc" },
    include: { criticReviews: true },
  });

  const openai = await p.provider.findFirst({ where: { name: { contains: "openai", mode: "insensitive" } } });
  const ep = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: { season: { include: { series: { select: { projectId: true } } } } },
  });
  const projectId = ep?.season.series.projectId;
  if (!projectId) { console.error("no projectId"); process.exit(1); }

  let logsAdded = 0;
  let costsAdded = 0;

  for (const s of scenes) {
    const existingLogs: any[] = await (p as any).sceneLog.findMany({
      where: { sceneId: s.id },
      select: { action: true },
    });
    const logActions = new Set(existingLogs.map((l: any) => l.action));
    const mem: any = s.memoryContext ?? {};

    // 1. Critic reviews
    for (const cr of s.criticReviews) {
      if (!logActions.has("critic_review")) {
        await (p as any).sceneLog.create({
          data: {
            sceneId: s.id,
            action: "critic_review",
            actor: "system:backfill",
            actorName: "AI Critic",
            details: { score: cr.score, feedbackPreview: String(cr.feedback ?? "").slice(0, 200) },
            createdAt: cr.createdAt,
          },
        });
        logsAdded++;
      }
      // CostEntry for critic
      const hasCriticCost = await p.costEntry.findFirst({
        where: { entityType: "SCENE", entityId: s.id, description: { contains: "Critic" } },
      });
      if (!hasCriticCost) {
        await p.costEntry.create({
          data: {
            entityType: "SCENE", entityId: s.id,
            costCategory: "TOKEN", description: `AI Critic · scene ${s.sceneNumber} (backfill)`,
            unitCost: 0.003, quantity: 1, totalCost: 0.003,
            sourceType: "BACKFILL", projectId,
            createdAt: cr.createdAt,
          },
        });
        costsAdded++;
      }
    }

    // 2. Sound notes
    if (mem.soundNotes) {
      if (!logActions.has("sound_notes_generated")) {
        await (p as any).sceneLog.create({
          data: {
            sceneId: s.id,
            action: "sound_notes_generated",
            actor: "system:backfill",
            actorName: "AI Sound",
            details: { preview: String(mem.soundNotes).slice(0, 200) },
          },
        });
        logsAdded++;
      }
      const hasSoundCost = await p.costEntry.findFirst({
        where: { entityType: "SCENE", entityId: s.id, description: { contains: "Sound" } },
      });
      if (!hasSoundCost) {
        await p.costEntry.create({
          data: {
            entityType: "SCENE", entityId: s.id,
            costCategory: "TOKEN", description: `AI Sound Notes · scene ${s.sceneNumber} (backfill)`,
            unitCost: 0.003, quantity: 1, totalCost: 0.003,
            sourceType: "BACKFILL", projectId,
          },
        });
        costsAdded++;
      }
    }

    // 3. Videos — log "video_ready" for each completed asset
    const assets = await p.asset.findMany({
      where: { entityType: "SCENE", entityId: s.id, assetType: "VIDEO", status: "READY" },
      orderBy: { createdAt: "asc" },
    });
    for (const a of assets) {
      const m: any = a.metadata ?? {};
      const hasVideoReady = existingLogs.some((l: any) => l.action === "video_ready" || l.action === "video_generated");
      if (!hasVideoReady) {
        await (p as any).sceneLog.create({
          data: {
            sceneId: s.id,
            action: "video_ready",
            actor: "system:backfill",
            actorName: m.model ?? "Sora 2",
            details: { provider: m.provider, model: m.model, durationSeconds: m.durationSeconds },
            createdAt: a.createdAt,
          },
        });
        logsAdded++;
      }
    }

    // 4. Remix suggests (if we can detect them — look for remix assets)
    const remixAssets = assets.filter((a) => {
      const m: any = a.metadata ?? {};
      return m.isExtension || existingLogs.some((l: any) => l.action === "video_remix");
    });
    // For now, if there are more than 1 video assets, likely remixes occurred
    if (assets.length > 1 && !logActions.has("remix_suggest")) {
      await (p as any).sceneLog.create({
        data: {
          sceneId: s.id,
          action: "remix_suggest",
          actor: "system:backfill",
          actorName: "AI Director",
          details: { note: "Director reviewed scene for remix" },
        },
      });
      logsAdded++;
      const hasRemixSuggestCost = await p.costEntry.findFirst({
        where: { entityType: "SCENE", entityId: s.id, description: { contains: "remix suggest" } },
      });
      if (!hasRemixSuggestCost) {
        await p.costEntry.create({
          data: {
            entityType: "SCENE", entityId: s.id,
            costCategory: "TOKEN", description: `AI Director remix suggest · scene ${s.sceneNumber} (backfill)`,
            unitCost: 0.005, quantity: 1, totalCost: 0.005,
            sourceType: "BACKFILL", projectId,
          },
        });
        costsAdded++;
      }
    }

    console.log(`SC${String(s.sceneNumber).padStart(2, "0")} — critics=${s.criticReviews.length} · soundNotes=${mem.soundNotes ? "yes" : "no"} · videos=${assets.length}`);
  }

  console.log(`\n✅ Added ${logsAdded} SceneLog rows + ${costsAdded} CostEntry rows.`);
  await p.$disconnect();
})();
