import { prisma } from "@vexo/db";

// =========================================================================
// CostStrategyService
// =========================================================================
export const CostStrategy = {
  async estimateSceneStoryboardCost(sceneId: string) {
    const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId }, include: { frames: true } });
    const frames = Math.max(scene.frames.length, 4);
    return { entityType: "SCENE", entityId: sceneId, estimate: frames * 0.05, currency: "USD" };
  },
  async estimateSceneVideoCost(sceneId: string) {
    const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    const seconds = scene.targetDurationSeconds ?? 8;
    return { entityType: "SCENE", entityId: sceneId, estimate: seconds * 0.10, currency: "USD" };
  },
  async recommendQualityMode(_sceneId: string) { return "STANDARD"; },
  async recommendProvider(_sceneId: string) { return "fal"; },
  async canAffordOperation(_entityId: string, _entityType: string) { return true; },
  async checkBudgetRisk(_entityId: string, _est: number) { return { status: "OK" as const, ratio: 0 }; },
};

// =========================================================================
// RevenueEngine
// =========================================================================
export const Revenue = {
  async calculateProfit(projectId: string) {
    const [costAgg, revAgg] = await Promise.all([
      prisma.costEntry.aggregate({ where: { projectId }, _sum: { totalCost: true } }),
      prisma.revenueEntry.aggregate({ where: { projectId }, _sum: { amount: true } }),
    ]);
    return (revAgg._sum.amount ?? 0) - (costAgg._sum.totalCost ?? 0);
  },
  async calculateROI(projectId: string) {
    const [costAgg, revAgg] = await Promise.all([
      prisma.costEntry.aggregate({ where: { projectId }, _sum: { totalCost: true } }),
      prisma.revenueEntry.aggregate({ where: { projectId }, _sum: { amount: true } }),
    ]);
    const cost = costAgg._sum.totalCost ?? 0;
    if (cost === 0) return null;
    return ((revAgg._sum.amount ?? 0) - cost) / cost;
  },
  async aggregateByEpisode(seriesId: string) {
    return prisma.episode.findMany({
      where: { season: { seriesId } },
      select: { id: true, title: true, episodeNumber: true, actualCost: true, revenueTotal: true },
    });
  },
  async calculateSplitPayouts(projectId: string) {
    const [splits, total] = await Promise.all([
      prisma.revenueSplit.findMany({ where: { projectId } }),
      prisma.revenueEntry.aggregate({ where: { projectId }, _sum: { amount: true } }),
    ]);
    const totalRev = total._sum.amount ?? 0;
    return splits.map((s) => ({ ...s, payout: totalRev * (s.percentage / 100) }));
  },
};

// =========================================================================
// MemoryEngine
// =========================================================================
export const Memory = {
  async addMemory(projectId: string, m: { memoryType: string; title: string; content: object; importanceScore?: number }) {
    return prisma.projectMemory.create({
      data: { projectId, memoryType: m.memoryType, title: m.title, content: m.content as any, importanceScore: m.importanceScore ?? 0.5 },
    });
  },
  async getRelevantMemories(projectId: string, _ctx: string) {
    return prisma.projectMemory.findMany({ where: { projectId }, orderBy: { importanceScore: "desc" }, take: 20 });
  },
  async generateRecap(_episodeId: string) { return "TODO: AI-generated recap"; },
  async refreshProjectMemory(_projectId: string) { return; },
};

// =========================================================================
// StyleConsistencyEngine
// =========================================================================
export const StyleEngine = {
  async analyzeApprovedFrames(projectId: string) {
    return prisma.styleConsistencySnapshot.create({
      data: { projectId, prompt: "TODO: analyze frames and produce style constraints" },
    });
  },
  async generateStyleConstraints(projectId: string) {
    const last = await prisma.styleConsistencySnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
    return last?.prompt ?? "";
  },
  async injectConstraints(prompt: string, projectId: string) {
    const c = await this.generateStyleConstraints(projectId);
    return c ? `${prompt}\n\nStyle: ${c}` : prompt;
  },
  async refreshSnapshot(projectId: string) {
    await this.analyzeApprovedFrames(projectId);
  },
};

// =========================================================================
// AIDirectorService
// =========================================================================
export const AIDirector = {
  async runNextStep(projectId: string) {
    await prisma.aILog.create({ data: { projectId, actorType: "DIRECTOR", actionType: "RUN_NEXT_STEP", input: {} } });
    return { action: "noop", reason: "stub" };
  },
  async buildEpisodeOutline(_episodeId: string) { return; },
  async proposeScenes(_episodeId: string) { return []; },
  async triggerGeneration(_sceneId: string) { return; },
  async preparePublishingPackage(_episodeId: string) { return; },
};

// =========================================================================
// AICriticService
// =========================================================================
export const AICritic = {
  async reviewScene(sceneId: string) {
    return prisma.aICriticReview.create({
      data: { entityType: "SCENE", entityId: sceneId, sceneId, contentType: "NARRATIVE", score: 0.75, feedback: "stub review" },
    });
  },
  async reviewEpisode(episodeId: string) {
    return prisma.aICriticReview.create({
      data: { entityType: "EPISODE", entityId: episodeId, episodeId, contentType: "CONTINUITY", score: 0.7, feedback: "stub review" },
    });
  },
  async reviewThumbnail(assetId: string) {
    return prisma.aICriticReview.create({
      data: { entityType: "ASSET", entityId: assetId, contentType: "THUMBNAIL", score: 0.6 },
    });
  },
  async scoreContinuity(_episodeId: string) { return 0.8; },
};

// =========================================================================
// SEOOptimizerService
// =========================================================================
export const SEO = {
  async generateEpisodeSEO(episodeId: string) {
    const ep = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    return {
      title: `${ep.title} | Episode ${ep.episodeNumber}`,
      description: ep.synopsis ?? `Episode ${ep.episodeNumber}: ${ep.title}`,
      tags: ["vexo", "studio", "episode"],
    };
  },
  async analyzeTrendingKeywords(_genre: string, _lang: string) { return ["trending-1", "trending-2"]; },
  async scoreMetadata(_t: string, _d: string, _tags: string[]) { return 0.7; },
};

// =========================================================================
// ScriptBreakdownService
// =========================================================================
export const ScriptBreakdown = {
  async parseScript(sceneId: string) {
    const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    const characters = (scene.scriptText ?? "").match(/\b[A-Z][A-Z]+\b/g) ?? [];
    return prisma.scriptBreakdown.upsert({
      where: { sceneId },
      update: { characters: [...new Set(characters)], locations: [], props: [] },
      create: { sceneId, characters: [...new Set(characters)], locations: [], props: [] },
    });
  },
};

// =========================================================================
// DialogueGeneratorService
// =========================================================================
export const Dialogue = {
  async generateDialogue(sceneId: string) {
    return prisma.scene.update({
      where: { id: sceneId },
      data: { dialogueJson: { stub: true, lines: [] } as any },
    });
  },
  async generateVoiceover(_sceneId: string, _characterId: string) {
    return "stub-asset-url";
  },
};

// =========================================================================
// AudienceInsightService
// =========================================================================
export const AudienceInsights = {
  async analyzeComments(episodeId: string) {
    const ep = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    const projectId = (await prisma.season.findUniqueOrThrow({ where: { id: ep.seasonId }, include: { series: true } })).series.projectId;
    return prisma.audienceInsight.create({
      data: { projectId, episodeId, insightType: "SENTIMENT", content: { score: 0.5, sample: 0 } as any },
    });
  },
  async detectDropOffPoints(_episodeId: string) { return [10, 25, 60]; },
  async generateContentRecommendations(_projectId: string) { return ["topic-A", "topic-B"]; },
};

// =========================================================================
// NotificationService
// =========================================================================
export const Notifications = {
  async send(opts: { userId: string; organizationId: string; type: string; title: string; body: string; entityType?: string; entityId?: string }) {
    return prisma.notificationEvent.create({ data: opts });
  },
  async markRead(id: string) { return prisma.notificationEvent.update({ where: { id }, data: { isRead: true, readAt: new Date() } }); },
  async markAllRead(userId: string, organizationId: string) {
    return prisma.notificationEvent.updateMany({ where: { userId, organizationId, isRead: false }, data: { isRead: true, readAt: new Date() } });
  },
};

// =========================================================================
// WebhookService
// =========================================================================
import crypto from "node:crypto";
export const Webhooks = {
  async deliver(endpointId: string, eventType: string, payload: unknown) {
    const ep = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } });
    if (!ep.isActive) return;
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", ep.secret).update(body).digest("hex");
    let status = 0, respBody = "", success = false;
    try {
      const res = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Vexo-Signature": signature, "X-Vexo-Event": eventType }, body });
      status = res.status; respBody = await res.text(); success = res.ok;
    } catch (e) { respBody = String(e); }
    await prisma.webhookDelivery.create({
      data: { endpointId: ep.id, eventType, payload: payload as any, responseStatus: status, responseBody: respBody.slice(0, 4000), success, deliveredAt: new Date() },
    });
  },
  async verifyIncoming(_providerId: string, payload: unknown, signature: string) {
    const expected = crypto.createHmac("sha256", process.env.ENCRYPTION_KEY ?? "").update(JSON.stringify(payload)).digest("hex");
    return signature && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  },
  async fanOut(orgId: string, eventType: string, payload: unknown) {
    const eps = await prisma.webhookEndpoint.findMany({ where: { organizationId: orgId, isActive: true } });
    await Promise.all(eps.filter((e) => (e.events as string[]).includes(eventType)).map((e) => this.deliver(e.id, eventType, payload)));
  },
};
