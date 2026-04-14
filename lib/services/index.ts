import { prisma } from "../prisma";
import { groqChat, groqJson, hasGroq } from "../groq";

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
  async generateRecap(episodeId: string) {
    if (!episodeId) return "No episode specified.";
    if (!hasGroq()) return "TODO: AI-generated recap (GROQ_API_KEY not set)";
    const ep = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: { scenes: { orderBy: { sceneNumber: "asc" }, select: { sceneNumber: true, title: true, summary: true, scriptText: true } } },
    });
    if (!ep) return "Episode not found.";
    const summary = ep.scenes.map((s) => `Scene ${s.sceneNumber}${s.title ? ` (${s.title})` : ""}: ${s.summary ?? s.scriptText?.slice(0, 200) ?? "—"}`).join("\n\n");
    return await groqChat([
      { role: "system", content: "You are a TV recap writer. Produce a punchy 2-3 sentence 'previously on' recap that hooks viewers." },
      { role: "user", content: `Episode: "${ep.title}"\nSynopsis: ${ep.synopsis ?? "—"}\n\nScenes:\n${summary}` },
    ], { temperature: 0.85, maxTokens: 250 });
  },
  async refreshProjectMemory(_projectId: string) { return; },
};

// =========================================================================
// StyleConsistencyEngine
// =========================================================================
export const StyleEngine = {
  async analyzeApprovedFrames(projectId: string) {
    let prompt = "Cinematic, consistent lighting, cohesive color palette.";
    if (hasGroq()) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      try {
        prompt = await groqChat([
          { role: "system", content: "You are an art director. Distill a one-paragraph visual style guide as a stable diffusion prompt fragment (under 60 words)." },
          { role: "user", content: `Project: ${project?.name}\nGenre: ${project?.genreTag ?? "—"}\nDescription: ${project?.description ?? "—"}\nStyle guide JSON: ${JSON.stringify(project?.styleGuide ?? {})}` },
        ], { temperature: 0.6, maxTokens: 200 });
      } catch { /* fall back to default */ }
    }
    return prisma.styleConsistencySnapshot.create({ data: { projectId, prompt } });
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
    let action = "noop";
    let reason = "no AI provider configured";
    let executed: Record<string, number> = {};

    try {
      const director = await prisma.aIDirector.findUnique({ where: { projectId } });
      const autopilot = director?.autopilotEnabled ?? false;

      // Lightweight project snapshot
      const [project, scenesStoryboard, scenesVideo, episodesReview, episodesReady, episodesDue] = await Promise.all([
        prisma.project.findUnique({ where: { id: projectId }, select: { name: true, status: true, contentType: true } }),
        prisma.scene.findMany({ where: { episode: { season: { series: { projectId } } }, status: "STORYBOARD_REVIEW" }, select: { id: true, episodeId: true } }),
        prisma.scene.findMany({ where: { episode: { season: { series: { projectId } } }, status: "VIDEO_REVIEW" }, select: { id: true, episodeId: true } }),
        prisma.episode.findMany({ where: { season: { series: { projectId } }, status: "REVIEW" }, select: { id: true, scenes: { select: { status: true } } } }),
        prisma.episode.count({ where: { season: { series: { projectId } }, status: "READY_FOR_PUBLISH" } }),
        prisma.episode.findMany({ where: { season: { series: { projectId } }, status: "READY_FOR_PUBLISH", scheduledPublishAt: { lte: new Date(), not: null }, publishedAt: null }, select: { id: true } }),
      ]);

      // ----- AUTOPILOT MODE: execute actions, don't just recommend -----
      if (autopilot) {
        // 1. Approve storyboards (STORYBOARD_REVIEW → STORYBOARD_APPROVED)
        if (scenesStoryboard.length > 0) {
          const r = await prisma.scene.updateMany({
            where: { id: { in: scenesStoryboard.map((s) => s.id) } },
            data: { status: "STORYBOARD_APPROVED" },
          });
          executed.storyboards_approved = r.count;
        }
        // 2. Approve video reviews (VIDEO_REVIEW → APPROVED)
        if (scenesVideo.length > 0) {
          const r = await prisma.scene.updateMany({
            where: { id: { in: scenesVideo.map((s) => s.id) } },
            data: { status: "APPROVED" },
          });
          executed.scenes_approved = r.count;
        }
        // 3. Promote episodes whose scenes are all APPROVED (REVIEW → READY_FOR_PUBLISH)
        const promotable = episodesReview.filter((e) => e.scenes.length > 0 && e.scenes.every((s) => s.status === "APPROVED" || s.status === "LOCKED"));
        if (promotable.length > 0) {
          const r = await prisma.episode.updateMany({
            where: { id: { in: promotable.map((e) => e.id) } },
            data: { status: "READY_FOR_PUBLISH" },
          });
          executed.episodes_promoted = r.count;
        }
        // 4. Publish episodes whose scheduled time has come
        if (episodesDue.length > 0) {
          const r = await prisma.episode.updateMany({
            where: { id: { in: episodesDue.map((e) => e.id) } },
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });
          executed.episodes_published = r.count;
        }

        const totalActed = Object.values(executed).reduce((a, b) => a + b, 0);
        if (totalActed > 0) {
          action = "autopilot_acted";
          reason = Object.entries(executed).map(([k, v]) => `${k}: ${v}`).join(", ");
          await prisma.aIDirector.update({ where: { projectId }, data: { experienceScore: { increment: 0.01 * totalActed } } });
        } else {
          action = "noop";
          reason = "Autopilot ran but nothing was actionable (no pending reviews, no scheduled publishes ready).";
        }
      }
      // ----- ASSISTED MODE: AI recommendation only -----
      else if (hasGroq()) {
        try {
          const j = await groqJson<{ action: string; reason: string }>(
            "You are an AI production director. Pick exactly one next action. Allowed: create_episode, write_scene, generate_storyboard, review_pending, publish, noop. Respond JSON: {action, reason}",
            `Project: ${project?.name}\nType: ${project?.contentType}\nStatus: ${project?.status}\nScenes pending storyboard review: ${scenesStoryboard.length}\nScenes pending video review: ${scenesVideo.length}\nEpisodes in review: ${episodesReview.length}\nEpisodes ready to publish: ${episodesReady}\nEpisodes whose schedule is due: ${episodesDue.length}\n\nNote: Autopilot is OFF. The user wants a recommendation, not execution.`,
            { temperature: 0.4, maxTokens: 200 },
          );
          action = j.action ?? "noop";
          reason = j.reason ?? "—";
        } catch (e) {
          if (episodesDue.length > 0) { action = "publish"; reason = `${episodesDue.length} episode(s) due (AI fallback)`; }
          else if (scenesStoryboard.length + scenesVideo.length > 0) { action = "review_pending"; reason = `${scenesStoryboard.length + scenesVideo.length} scene(s) await review (AI fallback)`; }
          else { action = "noop"; reason = `AI error: ${(e as Error).message.slice(0, 100)}`; }
        }
      } else {
        if (episodesDue.length > 0) { action = "publish"; reason = `${episodesDue.length} episode(s) due`; }
        else if (scenesStoryboard.length + scenesVideo.length > 0) { action = "review_pending"; reason = `${scenesStoryboard.length + scenesVideo.length} scene(s) await review`; }
      }
    } catch (e) { reason = `error: ${(e as Error).message.slice(0, 200)}`; }

    await prisma.aILog.create({
      data: { projectId, actorType: "DIRECTOR", actionType: action, decisionReason: reason, input: {}, output: { action, reason, executed } },
    });
    return { action, reason, executed };
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
    let score = 0.75; let feedback = "stub review"; let issues: string[] = []; let suggestions: string[] = [];
    if (hasGroq()) {
      try {
        const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
        const j = await groqJson<{ score: number; feedback: string; issues: string[]; suggestions: string[] }>(
          "You are a strict film critic. Rate the scene 0..1 (narrative clarity, character motivation, visual potential). Return JSON: { score, feedback, issues: [], suggestions: [] }",
          `Scene #${scene.sceneNumber}${scene.title ? `: ${scene.title}` : ""}\nSummary: ${scene.summary ?? "—"}\nScript:\n${scene.scriptText ?? "(no script)"}`,
          { temperature: 0.4, maxTokens: 400 },
        );
        score = Math.max(0, Math.min(1, j.score)); feedback = j.feedback; issues = j.issues ?? []; suggestions = j.suggestions ?? [];
      } catch (e) { feedback = `groq error: ${(e as Error).message}`; }
    }
    return prisma.aICriticReview.create({
      data: { entityType: "SCENE", entityId: sceneId, sceneId, contentType: "NARRATIVE", score, feedback, issuesDetected: issues, suggestions },
    });
  },
  async reviewEpisode(episodeId: string) {
    let score = 0.7; let feedback = "stub review";
    if (hasGroq()) {
      try {
        const ep = await prisma.episode.findUniqueOrThrow({
          where: { id: episodeId },
          include: { scenes: { orderBy: { sceneNumber: "asc" }, select: { sceneNumber: true, summary: true, scriptText: true } } },
        });
        const j = await groqJson<{ score: number; feedback: string }>(
          "You are a story editor. Review the episode's continuity, pacing and structure. Score 0..1. Return JSON: { score, feedback }",
          `Episode: ${ep.title}\nSynopsis: ${ep.synopsis ?? "—"}\n\nScenes:\n${ep.scenes.map((s) => `S${s.sceneNumber}: ${s.summary ?? s.scriptText?.slice(0, 150) ?? "—"}`).join("\n")}`,
          { temperature: 0.4, maxTokens: 400 },
        );
        score = Math.max(0, Math.min(1, j.score)); feedback = j.feedback;
      } catch (e) { feedback = `groq error: ${(e as Error).message}`; }
    }
    return prisma.aICriticReview.create({
      data: { entityType: "EPISODE", entityId: episodeId, episodeId, contentType: "CONTINUITY", score, feedback },
    });
  },
  async reviewThumbnail(assetId: string) {
    return prisma.aICriticReview.create({ data: { entityType: "ASSET", entityId: assetId, contentType: "THUMBNAIL", score: 0.6 } });
  },
  async scoreContinuity(_episodeId: string) { return 0.8; },
};

// =========================================================================
// SEOOptimizerService
// =========================================================================
export const SEO = {
  async generateEpisodeSEO(episodeId: string) {
    const ep = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId }, include: { season: { include: { series: { include: { project: true } } } } } });
    if (!hasGroq()) {
      return { title: `${ep.title} | Episode ${ep.episodeNumber}`, description: ep.synopsis ?? `Episode ${ep.episodeNumber}: ${ep.title}`, tags: ["vexo", "studio", "episode"] };
    }
    try {
      return await groqJson<{ title: string; description: string; tags: string[] }>(
        "You are a YouTube SEO expert. Generate optimized title (≤60 chars, hook), description (300-500 chars with timestamps placeholder), and 8-12 tags. Return JSON: { title, description, tags: [] }",
        `Series: ${ep.season.series.title}\nGenre: ${ep.season.series.genre ?? "—"}\nProject genre: ${ep.season.series.project.genreTag ?? "—"}\nEpisode #${ep.episodeNumber}: ${ep.title}\nSynopsis: ${ep.synopsis ?? "—"}\nLanguage: ${ep.season.series.project.language}`,
        { temperature: 0.7, maxTokens: 700 },
      );
    } catch {
      return { title: ep.title, description: ep.synopsis ?? "", tags: [] };
    }
  },
  async analyzeTrendingKeywords(genre: string, language: string) {
    if (!hasGroq()) return ["trending-1", "trending-2"];
    try {
      const j = await groqJson<{ keywords: string[] }>(
        "Return JSON { keywords: [] } with 10 currently-trending YouTube search keywords for the given genre and language.",
        `Genre: ${genre}\nLanguage: ${language}`,
        { temperature: 0.6, maxTokens: 300 },
      );
      return j.keywords;
    } catch { return []; }
  },
  async scoreMetadata(title: string, description: string, tags: string[]) {
    if (!hasGroq()) return 0.7;
    try {
      const j = await groqJson<{ score: number }>(
        "Score YouTube metadata 0..1 for SEO + click-through potential. Return JSON: { score }",
        `Title: ${title}\nDescription: ${description}\nTags: ${tags.join(", ")}`,
        { temperature: 0.3, maxTokens: 50 },
      );
      return Math.max(0, Math.min(1, j.score));
    } catch { return 0.5; }
  },
};

// =========================================================================
// ScriptBreakdownService
// =========================================================================
export const ScriptBreakdown = {
  async parseScript(sceneId: string) {
    const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    let characters: string[] = []; let locations: string[] = []; let props: string[] = []; let tone = "neutral"; let parsed: object = {};
    if (scene.scriptText) {
      // Heuristic fallback (uppercase tokens = characters)
      characters = [...new Set((scene.scriptText.match(/\b[A-Z][A-Z]+\b/g) ?? []))];
      if (hasGroq()) {
        try {
          const j = await groqJson<{ characters: string[]; locations: string[]; props: string[]; tone: string; dialogue: Array<{ character: string; line: string }> }>(
            "You are a 1st AD doing script breakdown. Extract: characters (named speakers), locations (INT/EXT), key props, dominant tone, and parse the dialogue. Return JSON: { characters, locations, props, tone, dialogue }",
            scene.scriptText,
            { temperature: 0.2, maxTokens: 1200 },
          );
          characters = j.characters ?? characters;
          locations = j.locations ?? [];
          props = j.props ?? [];
          tone = j.tone ?? tone;
          parsed = { dialogue: j.dialogue ?? [] };
        } catch { /* fallback */ }
      }
    }
    return prisma.scriptBreakdown.upsert({
      where: { sceneId },
      update: { characters, locations, props, toneAnalysis: tone, dialogueParsed: parsed },
      create: { sceneId, characters, locations, props, toneAnalysis: tone, dialogueParsed: parsed },
    });
  },
};

// =========================================================================
// DialogueGeneratorService
// =========================================================================
export const Dialogue = {
  async generateDialogue(sceneId: string) {
    const scene = await prisma.scene.findUniqueOrThrow({ where: { id: sceneId } });
    let dialogue: object = { lines: [] };
    if (hasGroq()) {
      try {
        const j = await groqJson<{ lines: Array<{ character: string; line: string; direction?: string }> }>(
          "You are a screenwriter. From the scene summary, write 6-12 lines of natural dialogue with character names and optional stage direction. Return JSON: { lines: [{ character, line, direction? }] }",
          `Title: ${scene.title ?? "Untitled"}\nSummary: ${scene.summary ?? "—"}\nExisting script (if any):\n${scene.scriptText ?? ""}`,
          { temperature: 0.85, maxTokens: 1500 },
        );
        dialogue = j;
      } catch { /* fallback */ }
    }
    return prisma.scene.update({ where: { id: sceneId }, data: { dialogueJson: dialogue as any } });
  },
  async generateVoiceover(_sceneId: string, _characterId: string) { return "stub-asset-url"; },
};

// =========================================================================
// AudienceInsightService
// =========================================================================
export const AudienceInsights = {
  async analyzeComments(episodeId: string) {
    const ep = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    const projectId = (await prisma.season.findUniqueOrThrow({ where: { id: ep.seasonId }, include: { series: true } })).series.projectId;
    let content: object = { score: 0.5, sample: 0 }; let recommendation: string | null = null;
    if (hasGroq()) {
      // In production: pull recent comments. For now we synthesize an analysis.
      try {
        const j = await groqJson<{ sentiment: number; topThemes: string[]; recommendation: string }>(
          "You are an audience insights analyst. Without real comment data, infer typical viewer sentiment for this episode and suggest one recommendation. Return JSON: { sentiment: 0..1, topThemes: [], recommendation }",
          `Episode: ${ep.title}\nSynopsis: ${ep.synopsis ?? "—"}`,
          { temperature: 0.6, maxTokens: 400 },
        );
        content = { score: j.sentiment, themes: j.topThemes, sample: 0 };
        recommendation = j.recommendation;
      } catch { /* fallback */ }
    }
    return prisma.audienceInsight.create({
      data: { projectId, episodeId, insightType: "SENTIMENT", content: content as any, recommendation },
    });
  },
  async detectDropOffPoints(_episodeId: string) { return [10, 25, 60]; },
  async generateContentRecommendations(projectId: string) {
    if (!hasGroq()) return ["topic-A", "topic-B"];
    try {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const j = await groqJson<{ ideas: string[] }>(
        "Suggest 5 fresh content ideas for the next episodes. Return JSON: { ideas: [] }",
        `Name: ${project?.name}\nGenre: ${project?.genreTag ?? "—"}\nDescription: ${project?.description ?? "—"}`,
        { temperature: 0.85, maxTokens: 400 },
      );
      return j.ideas;
    } catch { return []; }
  },
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

// =========================================================================
// AssistantService — generic content + check helper for cross-site use
// =========================================================================
export const Assistant = {
  /** Generate any kind of free-form content (titles, blurbs, marketing copy, etc.). */
  async generate(prompt: string, opts?: { system?: string; maxTokens?: number; temperature?: number }) {
    if (!hasGroq()) return { content: "(GROQ_API_KEY not set)", model: "stub" };
    const content = await groqChat([
      { role: "system", content: opts?.system ?? "You are a helpful writer for VEXO Studio." },
      { role: "user", content: prompt },
    ], { temperature: opts?.temperature ?? 0.7, maxTokens: opts?.maxTokens ?? 800 });
    return { content, model: "llama-3.3-70b-versatile" };
  },
  /** Check / score / lint arbitrary text. Returns { score, issues, suggestions }. */
  async check(text: string, criteria: string) {
    if (!hasGroq()) return { score: 0.5, issues: [], suggestions: ["GROQ_API_KEY not set"] };
    return await groqJson<{ score: number; issues: string[]; suggestions: string[] }>(
      `You evaluate content against the criteria. Return JSON: { score: 0..1, issues: [], suggestions: [] }. Criteria: ${criteria}`,
      text,
      { temperature: 0.3, maxTokens: 600 },
    );
  },
};
