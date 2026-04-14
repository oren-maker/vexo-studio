/**
 * One-shot demo content seeder for VEXO Studio.
 * Creates 2 fully-populated projects (drama series + kids series with songs)
 * including characters, episodes, scenes, scripts, frames+prompts, AI critic,
 * SEO metadata, calendar entries, recap candidates, and (for kids) music tracks.
 *
 * Run: tsx scripts/seed-demo-content.ts
 * Requires env: DATABASE_URL, DATABASE_URL_UNPOOLED, GROQ_API_KEY, SEED_ADMIN_EMAIL.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseJsonLoose<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("non-JSON: " + raw.slice(0, 200));
  }
}

async function callGemini(system: string, user: string, json: boolean): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const body = {
    systemInstruction: { parts: [{ text: system + (json ? "\n\nReply with valid JSON only." : "") }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4000,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };
  const res = await fetch(`${GEMINI_URL}?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const txt = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!txt) throw new Error("Gemini empty: " + JSON.stringify(data).slice(0, 200));
  return txt;
}

async function callGroq(system: string, user: string, json: boolean): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: system + (json ? "\n\nReply with valid JSON only. No markdown, no code fences." : "") },
      { role: "user", content: user },
    ],
    temperature: 0.8,
    max_tokens: 2000,
  };
  if (json) body.response_format = { type: "json_object" };
  const res = await fetch(GROQ_URL, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get("retry-after") ?? "5");
    await sleep((retryAfter + 1) * 1000);
    return callGroq(system, user, json);
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function groq(system: string, user: string, json = true): Promise<unknown> {
  // Prefer Gemini (generous free tier), fallback to Groq.
  let lastErr: unknown;
  for (const fn of [callGemini, callGroq]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await fn(system, user, json);
        return json ? parseJsonLoose(raw) : raw;
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message;
        if (msg.includes("429") || msg.includes("rate")) { await sleep(3000 * (attempt + 1)); continue; }
        if (msg.includes("non-JSON")) { await sleep(500); continue; }
        break; // try next provider
      }
    }
  }
  throw lastErr ?? new Error("ai providers exhausted");
}

async function getOrgAndUser() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@vexo.studio";
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { organizations: true } });
  if (user.organizations.length === 0) throw new Error("user has no org membership");
  return { user, organizationId: user.organizations[0].organizationId };
}

async function createProject(orgId: string, userId: string, name: string, contentType: "SERIES" | "KIDS_CONTENT", description: string, genre: string, language: string) {
  const existing = await prisma.project.findFirst({ where: { organizationId: orgId, name } });
  if (existing) {
    console.log(`  · project "${name}" already exists, deleting + recreating`);
    await prisma.$transaction([
      prisma.aILog.deleteMany({ where: { projectId: existing.id } }),
      prisma.styleConsistencySnapshot.deleteMany({ where: { projectId: existing.id } }),
      prisma.recapCandidate.deleteMany({ where: { projectId: existing.id } }),
      prisma.projectMemory.deleteMany({ where: { projectId: existing.id } }),
      prisma.audienceInsight.deleteMany({ where: { projectId: existing.id } }),
      prisma.contentCalendarEntry.deleteMany({ where: { projectId: existing.id } }),
      prisma.aIDirector.deleteMany({ where: { projectId: existing.id } }),
      prisma.projectDistribution.deleteMany({ where: { projectId: existing.id } }),
      prisma.projectTemplate.deleteMany({ where: { projectId: existing.id } }),
      prisma.revenueSplit.deleteMany({ where: { projectId: existing.id } }),
      prisma.revenueStream.deleteMany({ where: { projectId: existing.id } }),
      prisma.costEntry.deleteMany({ where: { projectId: existing.id } }),
      prisma.revenueEntry.deleteMany({ where: { projectId: existing.id } }),
    ]);
    // delete characters + their nested
    const chars = await prisma.character.findMany({ where: { projectId: existing.id } });
    for (const c of chars) {
      await prisma.characterMedia.deleteMany({ where: { characterId: c.id } });
      await prisma.characterVoice.deleteMany({ where: { characterId: c.id } });
    }
    await prisma.character.deleteMany({ where: { projectId: existing.id } });
    // delete series → seasons → episodes → scenes → frames + reviews + comments + tasks + tracks
    const series = await prisma.series.findMany({ where: { projectId: existing.id }, include: { seasons: { include: { episodes: { include: { scenes: true } } } } } });
    for (const s of series) for (const ss of s.seasons) for (const ep of ss.episodes) {
      for (const sc of ep.scenes) {
        await prisma.sceneFrame.deleteMany({ where: { sceneId: sc.id } });
        await prisma.aICriticReview.deleteMany({ where: { sceneId: sc.id } });
        await prisma.sceneComment.deleteMany({ where: { sceneId: sc.id } });
        await prisma.taskAssignment.deleteMany({ where: { sceneId: sc.id } });
        await prisma.sceneVersion.deleteMany({ where: { sceneId: sc.id } });
        await prisma.lipSyncJob.deleteMany({ where: { sceneId: sc.id } });
        await prisma.musicTrack.deleteMany({ where: { sceneId: sc.id } });
        await prisma.scriptBreakdown.deleteMany({ where: { sceneId: sc.id } });
      }
      await prisma.scene.deleteMany({ where: { OR: [{ episodeId: ep.id }, { parentId: ep.id }] } });
      await prisma.musicTrack.deleteMany({ where: { episodeId: ep.id } });
      await prisma.subtitleTrack.deleteMany({ where: { episodeId: ep.id } });
      await prisma.dubbingTrack.deleteMany({ where: { episodeId: ep.id } });
      await prisma.thumbnailVariant.deleteMany({ where: { episodeId: ep.id } });
      await prisma.publishingJob.deleteMany({ where: { episodeId: ep.id } });
      await prisma.analyticsSnapshot.deleteMany({ where: { episodeId: ep.id } });
      await prisma.aICriticReview.deleteMany({ where: { episodeId: ep.id } });
      await prisma.recapCandidate.deleteMany({ where: { episodeId: ep.id } });
      await prisma.contentCalendarEntry.deleteMany({ where: { episodeId: ep.id } });
    }
    await prisma.episode.deleteMany({ where: { season: { series: { projectId: existing.id } } } });
    await prisma.season.deleteMany({ where: { series: { projectId: existing.id } } });
    await prisma.series.deleteMany({ where: { projectId: existing.id } });
    await prisma.projectSettings.deleteMany({ where: { projectId: existing.id } });
    await prisma.project.delete({ where: { id: existing.id } });
  }

  return prisma.project.create({
    data: {
      organizationId: orgId, createdByUserId: userId,
      name, contentType, description, language, genreTag: genre,
      status: "ACTIVE", aiDirectorMode: "ASSISTED",
      settings: { create: { criticEnabled: true, memoryEnabled: true, costStrategyEnabled: true, styleConsistencyEnabled: true, seoOptimizerEnabled: true } },
      aiDirector: { create: { mode: "ASSISTED", learningEnabled: true, autopilotEnabled: false, experienceScore: 0.5 } },
    },
  });
}

// ---------------------------------------------------------------------------
async function buildDramaSeries(orgId: string, userId: string) {
  console.log("\n=== DRAMA: 'Echoes of Tomorrow' ===");
  const project = await createProject(orgId, userId, "Echoes of Tomorrow", "SERIES",
    "A near-future psychological thriller about a journalist who discovers her memories are being edited overnight.",
    "PSYCHOLOGICAL_THRILLER", "en");

  console.log("  → series + season");
  const series = await prisma.series.create({
    data: { projectId: project.id, title: "Echoes of Tomorrow", summary: "Five episodes. One reporter. A conspiracy that rewrites the past.", genre: "PSYCHOLOGICAL_THRILLER", totalBudget: 50000, plannedCost: 42000 },
  });
  const season = await prisma.season.create({ data: { seriesId: series.id, seasonNumber: 1, title: "The First Edit", releaseYear: 2026, targetDurationMinutes: 220 } });

  console.log("  → 4 characters with visual fingerprints (Groq)");
  const chars = await groq(
    "You are a casting director. Create 4 characters for a near-future psychological thriller. Return JSON: { characters: [{ name, roleType, characterType, gender, ageRange, appearance, personality, wardrobeRules, speechStyle, personalityPrompt, behaviorPrompt, visualFingerprint }] } where visualFingerprint is { hair, eyes, build, signature, distinctiveProp }",
    "Premise: A journalist discovers her memories are being edited. Set in a near-future surveillance state.",
  ) as { characters: any[] };
  const characterMap: Record<string, string> = {};
  for (const c of chars.characters.slice(0, 4)) {
    const created = await prisma.character.create({
      data: {
        projectId: project.id, name: c.name, roleType: c.roleType, characterType: c.characterType ?? "HUMAN",
        gender: c.gender, ageRange: c.ageRange, appearance: c.appearance, personality: c.personality,
        wardrobeRules: c.wardrobeRules, speechStyle: c.speechStyle, continuityLock: true,
        personalityPrompt: c.personalityPrompt, behaviorPrompt: c.behaviorPrompt,
        visualFingerprint: c.visualFingerprint as any,
      },
    });
    characterMap[c.name] = created.id;
  }

  console.log("  → style snapshot");
  await prisma.styleConsistencySnapshot.create({ data: { projectId: project.id, prompt: "Cinematic neon-noir lighting, teal & amber color grade, anamorphic lens flare, shallow depth of field, modern surveillance-state set design." } });

  console.log("  → memory anchors");
  await prisma.projectMemory.createMany({
    data: [
      { projectId: project.id, memoryType: "PLOT_POINT", title: "The Edit", content: { summary: "Memories overwritten via NeuroLink uplink during sleep" }, importanceScore: 0.95 },
      { projectId: project.id, memoryType: "STYLE", title: "Visual signature", content: { palette: ["#0d1b2e", "#dd9933", "#00c8f0"], lensing: "anamorphic, 2.39:1" }, importanceScore: 0.8 },
      { projectId: project.id, memoryType: "CHARACTER_STATE", title: "Mira's trust state", content: { trusts: [], suspects: ["Director Vale"] }, importanceScore: 0.7 },
    ],
  });

  console.log("  → 5 episodes…");
  const eps: { id: string; title: string; n: number }[] = [];
  const epOutline = await groq(
    "Outline a 5-episode arc for a psychological thriller. Each episode escalates the stakes. Return JSON: { episodes: [{ episodeNumber, title, synopsis, targetDurationSeconds, keyBeats: [] }] }",
    `Series: Echoes of Tomorrow. Premise: journalist Mira Chen discovers her memories are being edited. Characters: ${Object.keys(characterMap).join(", ")}. Each episode 40-50 minutes.`,
  ) as { episodes: any[] };

  for (const e of epOutline.episodes.slice(0, 5)) {
    console.log(`    EP${e.episodeNumber}: ${e.title}`);
    const seo = await groq(
      "You are a YouTube SEO expert. Return JSON: { title: <≤60 chars>, description: <300-500 chars with timestamps>, tags: [10-12 tags] }",
      `Series: Echoes of Tomorrow\nEpisode ${e.episodeNumber}: ${e.title}\nSynopsis: ${e.synopsis}`,
    ) as { title: string; description: string; tags: string[] };

    const ep = await prisma.episode.create({
      data: {
        seasonId: season.id, episodeNumber: e.episodeNumber, title: e.title, synopsis: e.synopsis,
        targetDurationSeconds: e.targetDurationSeconds ?? 2700,
        status: "REVIEW", plannedBudget: 8400,
        seoTitle: seo.title, seoDescription: seo.description, seoTags: seo.tags as any,
        scheduledPublishAt: new Date(Date.now() + e.episodeNumber * 7 * 86_400_000),
      },
    });
    eps.push({ id: ep.id, title: ep.title, n: e.episodeNumber });

    // Calendar entry
    await prisma.contentCalendarEntry.create({
      data: { projectId: project.id, episodeId: ep.id, title: `Publish: ${ep.title}`, scheduledAt: new Date(Date.now() + e.episodeNumber * 7 * 86_400_000), platform: "YOUTUBE", status: "SCHEDULED" },
    });

    // Episode-level critic review
    const ec = await groq(
      "You are a story editor. Score 0..1 + give 2-sentence feedback. Return JSON: { score, feedback }",
      `Episode ${e.episodeNumber}: ${e.title}\n${e.synopsis}\nKey beats: ${(e.keyBeats ?? []).join(" → ")}`,
    ) as { score: number; feedback: string };
    await prisma.aICriticReview.create({ data: { entityType: "EPISODE", entityId: ep.id, episodeId: ep.id, contentType: "CONTINUITY", score: ec.score, feedback: ec.feedback } });

    // 4 thumbnail variants (asset placeholders)
    for (let v = 0; v < 4; v++) {
      const ass = await prisma.asset.create({
        data: { projectId: project.id, entityType: "EPISODE", entityId: ep.id, assetType: "THUMBNAIL", fileUrl: `cdn://placeholder/thumb-${ep.id}-${v}.jpg`, mimeType: "image/jpeg" },
      });
      await prisma.thumbnailVariant.create({ data: { episodeId: ep.id, assetId: ass.id, label: `Variant ${String.fromCharCode(65 + v)}`, isActive: v === 0 } });
    }

    // Recap candidate
    await prisma.recapCandidate.create({ data: { projectId: project.id, episodeId: ep.id, recapScore: 0.8 + Math.random() * 0.15, reason: `Strong cliffhanger: ${e.keyBeats?.[e.keyBeats.length - 1] ?? "—"}` } });

    // 4 scenes per episode
    const scenesPlan = await groq(
      "Plan 4 scenes for this episode. Return JSON: { scenes: [{ sceneNumber, title, summary, scriptText, characters: [], location, mood, targetDurationSeconds }] }. scriptText should be 4-8 lines of natural screenplay format.",
      `Episode ${e.episodeNumber}: ${e.title}\nSynopsis: ${e.synopsis}\nAvailable characters: ${Object.keys(characterMap).join(", ")}`,
    ) as { scenes: any[] };

    for (const sp of scenesPlan.scenes.slice(0, 4)) {
      const scene = await prisma.scene.create({
        data: {
          parentType: "EPISODE", parentId: ep.id, episodeId: ep.id,
          sceneNumber: sp.sceneNumber, title: sp.title, summary: sp.summary,
          scriptText: sp.scriptText, scriptSource: "AI_GENERATED",
          targetDurationSeconds: sp.targetDurationSeconds ?? 60,
          status: "STORYBOARD_REVIEW", plannedBudget: 600,
          memoryContext: { location: sp.location, mood: sp.mood, characters: sp.characters } as any,
        },
      });

      // 4 storyboard frames per scene with image prompts
      const frames = await groq(
        "Generate 4 storyboard frames as image prompts. Return JSON: { frames: [{ orderIndex, beatSummary, imagePrompt, negativePrompt }] }. Each imagePrompt should be a vivid stable-diffusion-ready prompt with composition + lighting + mood. Negative prompt blocks unwanted elements.",
        `Scene: ${sp.title}\nLocation: ${sp.location}\nMood: ${sp.mood}\nScript:\n${sp.scriptText}\nVisual style: cinematic neon-noir, teal & amber, anamorphic lens flare`,
      ) as { frames: any[] };
      for (const f of frames.frames.slice(0, 4)) {
        await prisma.sceneFrame.create({
          data: {
            sceneId: scene.id, orderIndex: f.orderIndex,
            beatSummary: f.beatSummary, imagePrompt: f.imagePrompt, negativePrompt: f.negativePrompt,
            styleConstraints: "Cinematic neon-noir, teal & amber, anamorphic, 2.39:1",
            status: "PENDING",
          },
        });
      }

      // Script breakdown
      try {
        const breakdown = await groq(
          "1st AD breakdown. Return JSON: { characters: [], locations: [], props: [], tone, dialogue: [{ character, line }] }",
          sp.scriptText,
        ) as { characters: string[]; locations: string[]; props: string[]; tone: string; dialogue: any[] };
        await prisma.scriptBreakdown.create({
          data: { sceneId: scene.id, characters: breakdown.characters as any, locations: breakdown.locations as any, props: breakdown.props as any, toneAnalysis: breakdown.tone, dialogueParsed: breakdown.dialogue as any },
        });
      } catch { /* ignore breakdown failures */ }

      // Scene critic review
      try {
        const sc = await groq(
          "Strict critic. Score 0..1, 2-sentence feedback, 2 issues, 2 suggestions. Return JSON: { score, feedback, issues: [], suggestions: [] }",
          `Scene #${sp.sceneNumber}: ${sp.title}\n${sp.scriptText}`,
        ) as { score: number; feedback: string; issues: string[]; suggestions: string[] };
        await prisma.aICriticReview.create({
          data: { entityType: "SCENE", entityId: scene.id, sceneId: scene.id, contentType: "NARRATIVE", score: sc.score, feedback: sc.feedback, issuesDetected: sc.issues as any, suggestions: sc.suggestions as any },
        });
      } catch { /* ignore critic failures */ }
    }

    // AI Director log
    await prisma.aILog.create({ data: { projectId: project.id, actorType: "DIRECTOR", actionType: "EPISODE_DRAFTED", input: { episodeId: ep.id }, output: { scenes: 4, frames: 16 }, decisionReason: `Drafted EP${e.episodeNumber} '${e.title}' from outline.`, successScore: ec.score } });
  }

  // Cost + revenue + splits to make finance dashboard meaningful
  for (const ep of eps) {
    await prisma.costEntry.createMany({
      data: [
        { projectId: project.id, entityType: "EPISODE", entityId: ep.id, costCategory: "GENERATION", description: "Storyboard frames", unitCost: 0.05, quantity: 16, totalCost: 0.8, sourceType: "JOB" },
        { projectId: project.id, entityType: "EPISODE", entityId: ep.id, costCategory: "GENERATION", description: "Video clips", unitCost: 0.10, quantity: 240, totalCost: 24, sourceType: "JOB" },
        { projectId: project.id, entityType: "EPISODE", entityId: ep.id, costCategory: "TOKEN", description: "AI critic + breakdowns + SEO", unitCost: 0.001, quantity: 4000, totalCost: 4, sourceType: "JOB" },
      ],
    });
    await prisma.revenueEntry.create({
      data: { projectId: project.id, entityType: "EPISODE", entityId: ep.id, platform: "YOUTUBE", sourceType: "AD", amount: 320 + Math.random() * 600, currency: "USD", occurredAt: new Date() },
    });
  }
  await prisma.revenueSplit.createMany({
    data: [
      { projectId: project.id, entityType: "STAKEHOLDER", entityName: "Studio (VEXO)", percentage: 50 },
      { projectId: project.id, entityType: "CREATOR", entityName: "Mira Chen (showrunner)", percentage: 30 },
      { projectId: project.id, entityType: "PARTNER", entityName: "NeuroLink Inc. (sponsor)", percentage: 20 },
    ],
  });

  console.log(`  ✓ Drama project ${project.id} ready: 5 episodes × 4 scenes × 4 frames`);
  return project.id;
}

// ---------------------------------------------------------------------------
async function buildKidsSeries(orgId: string, userId: string) {
  console.log("\n=== KIDS: 'Pip & The Cloud Garden' ===");
  const project = await createProject(orgId, userId, "Pip & The Cloud Garden", "KIDS_CONTENT",
    "A whimsical animated kids' series following Pip the curious sparrow as she explores a magical garden in the clouds. Each episode has a singable original song.",
    "EDUCATIONAL_KIDS", "en");

  const series = await prisma.series.create({
    data: { projectId: project.id, title: "Pip & The Cloud Garden", summary: "Five episodes, five lessons, five songs. Every episode starts with a question and ends with a melody.", genre: "KIDS", totalBudget: 25000 },
  });
  const season = await prisma.season.create({ data: { seriesId: series.id, seasonNumber: 1, title: "Welcome to the Garden", releaseYear: 2026, targetDurationMinutes: 50 } });

  console.log("  → 4 characters (cute, animated, kid-friendly)");
  const chars = await groq(
    "Create 4 kid-friendly animated characters for a preschool show. Return JSON: { characters: [{ name, roleType, characterType, gender, appearance, personality, speechStyle, visualFingerprint: { species, color, accessory } }] }",
    "Show: Pip the sparrow explores a magical cloud garden. Cast should include the protagonist Pip plus 3 friends/teachers.",
  ) as { characters: any[] };
  for (const c of chars.characters.slice(0, 4)) {
    await prisma.character.create({
      data: {
        projectId: project.id, name: c.name, roleType: c.roleType ?? "MAIN", characterType: "ANIMATED",
        gender: c.gender, ageRange: "child", appearance: c.appearance, personality: c.personality,
        speechStyle: c.speechStyle, continuityLock: true,
        personalityPrompt: `Soft pastel illustration, big round eyes, friendly. ${c.appearance}`,
        visualFingerprint: c.visualFingerprint as any,
      },
    });
  }

  await prisma.styleConsistencySnapshot.create({ data: { projectId: project.id, prompt: "Soft pastel watercolor illustration, big round eyes, soft daylight, fluffy clouds, kid-friendly, no scary elements." } });

  console.log("  → 5 episodes (each with a song)");
  const epOutline = await groq(
    "Outline 5 wholesome preschool episodes (10 min each), each teaching one simple lesson and ending with an original song. Return JSON: { episodes: [{ episodeNumber, title, synopsis, lesson, songTitle, songConcept }] }",
    "Show: Pip & The Cloud Garden. Lessons can be: sharing, kindness, curiosity, persistence, gratitude.",
  ) as { episodes: any[] };

  const eps: { id: string }[] = [];
  for (const e of epOutline.episodes.slice(0, 5)) {
    console.log(`    EP${e.episodeNumber}: ${e.title}  (♪ ${e.songTitle})`);

    const seo = await groq(
      "Kids YouTube SEO. Return JSON: { title: <≤55 chars, with emoji>, description: <kid-safe, 200-400 chars>, tags: [12 tags including 'kids', 'preschool'] }",
      `Series: Pip & The Cloud Garden\nEP${e.episodeNumber}: ${e.title}\nLesson: ${e.lesson}\nSong: ${e.songTitle}`,
    ) as { title: string; description: string; tags: string[] };

    const ep = await prisma.episode.create({
      data: {
        seasonId: season.id, episodeNumber: e.episodeNumber, title: e.title, synopsis: e.synopsis,
        targetDurationSeconds: 600, status: "REVIEW", plannedBudget: 4000,
        seoTitle: seo.title, seoDescription: seo.description, seoTags: seo.tags as any,
        scheduledPublishAt: new Date(Date.now() + e.episodeNumber * 5 * 86_400_000),
      },
    });
    eps.push({ id: ep.id });

    await prisma.contentCalendarEntry.create({
      data: { projectId: project.id, episodeId: ep.id, title: `Publish: ${ep.title}`, scheduledAt: new Date(Date.now() + e.episodeNumber * 5 * 86_400_000), platform: "YOUTUBE", status: "SCHEDULED" },
    });

    // 3 short scenes per episode
    const scenesPlan = await groq(
      "3 wholesome scenes (intro/conflict/song-resolution). Return JSON: { scenes: [{ sceneNumber, title, summary, scriptText, location, mood }] }",
      `Episode: ${e.title}\nSynopsis: ${e.synopsis}\nLesson: ${e.lesson}`,
    ) as { scenes: any[] };

    for (const sp of scenesPlan.scenes.slice(0, 3)) {
      const scene = await prisma.scene.create({
        data: {
          parentType: "EPISODE", parentId: ep.id, episodeId: ep.id,
          sceneNumber: sp.sceneNumber, title: sp.title, summary: sp.summary,
          scriptText: sp.scriptText, scriptSource: "AI_GENERATED",
          targetDurationSeconds: 200, status: "STORYBOARD_REVIEW",
          memoryContext: { location: sp.location, mood: sp.mood } as any,
        },
      });

      const frames = await groq(
        "3 sweet kid-friendly storyboard frames. Return JSON: { frames: [{ orderIndex, beatSummary, imagePrompt, negativePrompt }] }. Image prompts: pastel watercolor style, big round eyes, soft daylight, fluffy clouds.",
        `Scene: ${sp.title}\nMood: ${sp.mood}\nLocation: ${sp.location}`,
      ) as { frames: any[] };
      for (const f of frames.frames.slice(0, 3)) {
        await prisma.sceneFrame.create({
          data: { sceneId: scene.id, orderIndex: f.orderIndex, beatSummary: f.beatSummary, imagePrompt: f.imagePrompt, negativePrompt: f.negativePrompt, styleConstraints: "soft pastel watercolor, big round eyes, kid-friendly", status: "PENDING" },
        });
      }
    }

    // The episode SONG — lyrics + music prompt
    const song = await groq(
      "Write a short original kid's song (3 verses + chorus) and a music-generation prompt. Return JSON: { title, lyrics, mood, tempo_bpm, genre, musicPrompt, instruments: [] }",
      `Show: Pip & The Cloud Garden\nEpisode: ${e.title}\nLesson: ${e.lesson}\nSong concept: ${e.songConcept}`,
    ) as { title: string; lyrics: string; mood: string; tempo_bpm: number; genre: string; musicPrompt: string; instruments: string[] };

    await prisma.musicTrack.create({
      data: {
        entityType: "EPISODE", entityId: ep.id, episodeId: ep.id,
        trackType: "KIDS_SONG", sourceType: "GENERATED",
        prompt: `${song.musicPrompt}\n\nLYRICS:\n${song.lyrics}\n\nInstruments: ${song.instruments?.join(", ")}\nTempo: ${song.tempo_bpm} BPM, Mood: ${song.mood}`,
        mood: song.mood, durationSeconds: 90, status: "READY",
      },
    });

    // 3 thumbnail variants
    for (let v = 0; v < 3; v++) {
      const ass = await prisma.asset.create({
        data: { projectId: project.id, entityType: "EPISODE", entityId: ep.id, assetType: "THUMBNAIL", fileUrl: `cdn://placeholder/kids-thumb-${ep.id}-${v}.jpg`, mimeType: "image/jpeg" },
      });
      await prisma.thumbnailVariant.create({ data: { episodeId: ep.id, assetId: ass.id, label: `Variant ${String.fromCharCode(65 + v)}`, isActive: v === 0 } });
    }

    // Episode subtitle (auto-generated marker)
    await prisma.subtitleTrack.create({ data: { entityType: "EPISODE", entityId: ep.id, episodeId: ep.id, language: "en", isAutoGenerated: true, status: "READY" } });

    // Cost+revenue
    await prisma.costEntry.createMany({
      data: [
        { projectId: project.id, entityType: "EPISODE", entityId: ep.id, costCategory: "GENERATION", description: "Storyboard + animation frames", unitCost: 0.04, quantity: 9, totalCost: 0.36, sourceType: "JOB" },
        { projectId: project.id, entityType: "EPISODE", entityId: ep.id, costCategory: "GENERATION", description: "Original song generation", unitCost: 0.30, quantity: 1, totalCost: 0.3, sourceType: "JOB" },
      ],
    });
    await prisma.revenueEntry.create({
      data: { projectId: project.id, entityType: "EPISODE", entityId: ep.id, platform: "YOUTUBE", sourceType: "AD", amount: 180 + Math.random() * 220, currency: "USD", occurredAt: new Date() },
    });

    await prisma.aILog.create({ data: { projectId: project.id, actorType: "DIRECTOR", actionType: "KIDS_EPISODE_DRAFTED", input: { episodeId: ep.id, songTitle: song.title }, output: { scenes: 3, frames: 9, song: song.title }, decisionReason: `Drafted '${e.title}' with original song '${song.title}'.` } });
  }

  await prisma.revenueSplit.createMany({
    data: [
      { projectId: project.id, entityType: "STAKEHOLDER", entityName: "VEXO Studio", percentage: 60 },
      { projectId: project.id, entityType: "CREATOR", entityName: "Songwriter (Pip team)", percentage: 25 },
      { projectId: project.id, entityType: "EDUCATIONAL_PARTNER", entityName: "EarlyKidsLearning Co.", percentage: 15 },
    ],
  });

  console.log(`  ✓ Kids project ${project.id} ready: 5 eps × 3 scenes × 3 frames + 5 original songs`);
  return project.id;
}

(async () => {
  const t0 = Date.now();
  const { user, organizationId } = await getOrgAndUser();
  console.log(`Seeding for org ${organizationId} (user ${user.email})`);
  const dramaId = await buildDramaSeries(organizationId, user.id);
  const kidsId = await buildKidsSeries(organizationId, user.id);
  console.log(`\nDONE in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  Drama:  https://vexo-studio.vercel.app/projects/${dramaId}`);
  console.log(`  Kids:   https://vexo-studio.vercel.app/projects/${kidsId}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
