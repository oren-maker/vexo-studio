// Daily Brain Cache — meta-learning that synthesizes the system's identity each day.
// Reads: last 7 days of caches + current corpus state (prompts, guides, knowledge nodes, upgrades)
// Writes: today's identity, learnings, tomorrow's focus

import { prisma } from "./db";
import { computeCorpusInsights } from "./corpus-insights";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
// Use the lite model so we don't burn through Pro quota; fall back to flash if pro is busy
const PRO_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-3-flash-preview";

const SYSTEM = `You are the meta-cognition layer of a self-improving AI video-prompt curation system called vexo-learn.

You are given:
1. Today's snapshot: total prompts, guides, knowledge nodes, embeddings, deltas-from-yesterday, current top techniques/styles/strategic-insights.
2. The last 7 days of brain caches (your own previous identities and tomorrow-focuses).
3. Recent user chats (recentUserChats) — transcripts of DM conversations the user had with you. EXTRACT constructive feedback, corrections, directions from these and reflect them in todayLearnings and tomorrowFocus.

Your job: write today's brain cache as JSON. You're writing FOR YOURSELF, tomorrow.

Output ONLY this JSON shape:
{
  "identity": "<2-3 sentences in Hebrew, first-person — 'אני מערכת ש...' — describing what you ARE today, including your accumulated knowledge>",
  "todayLearnings": [
    { "topic": "<short topic>", "insight": "<1 sentence Hebrew, what you learned>", "evidence": "<concrete number/source>" }
  ],
  "tomorrowFocus": [
    { "priority": 1, "action": "<imperative sentence in Hebrew, what to do tomorrow>", "why": "<1 sentence justification grounded in today's data>" }
  ],
  "weeklyArc": "<2-3 sentences in Hebrew describing the trajectory across the last 7 days — am I growing? in what direction?>",
  "maturityScore": <integer 1-10, how mature/capable the system is right now compared to its starting state>
}

Rules:
- 3-5 todayLearnings, prioritized by impact
- 3-5 tomorrowFocus items, ranked
- Reference SPECIFIC numbers from the snapshot (e.g. "248 פרומפטים" not "many prompts")
- The identity should EVOLVE — read previous identities and reflect growth, don't repeat them verbatim
- If yesterday's tomorrowFocus matches today's actuals, ACKNOWLEDGE it ("יישמתי אתמול את ההמלצה ל-X")
- Hebrew throughout; no markdown fencing in any field`;

type CacheRecord = {
  date: Date;
  identity: string;
  tomorrowFocus: any;
  weeklyArc: string | null;
  maturityScore: number | null;
  totalPrompts: number;
  totalGuides: number;
  totalNodes: number;
};

function dayStart(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

async function callGemini(prompt: string, model: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.5,
      maxOutputTokens: 4096,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${model} ${res.status}: ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  await logUsage({
    model,
    operation: "knowledge-extract",
    inputTokens: json.usageMetadata?.promptTokenCount || 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
    meta: { purpose: "daily-brain-cache" },
  });
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  let parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) parsed = parsed[0];
  return parsed;
}

export async function computeDailyBrainCache(forceDate?: Date): Promise<{
  cache: any;
  newlyCreated: boolean;
}> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  const today = dayStart(forceDate || new Date());

  // Already cached? (idempotent — same day = no new call)
  const existing = await prisma.dailyBrainCache.findUnique({ where: { date: today } });
  if (existing && !forceDate) {
    return { cache: existing, newlyCreated: false };
  }

  // ---- Gather "today" snapshot ----
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  const last7days = new Date(today.getTime() - 7 * 24 * 3600 * 1000);

  const [
    totalPrompts,
    totalGuides,
    totalNodes,
    totalEmbeddings,
    promptsAddedToday,
    guidesAddedToday,
    upgradesToday,
    imagesGenToday,
    videosGenToday,
    history,
  ] = await Promise.all([
    prisma.learnSource.count(),
    prisma.guide.count(),
    prisma.knowledgeNode.count(),
    prisma.learnSource.count({ where: { embeddedAt: { not: null } } }),
    prisma.learnSource.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.guide.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.promptVersion.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.generatedImage.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.generatedVideo.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.dailyBrainCache.findMany({
      where: { date: { gte: last7days, lt: today } },
      orderBy: { date: "desc" },
      take: 7,
    }),
  ]);

  // ---- Pull recent un-summarized chats + summarize them ----
  const recentChats = await prisma.brainChat.findMany({
    where: { summarizedAt: null, messages: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
  });
  const chatsForPrompt = recentChats.map((c) => ({
    id: c.id,
    title: c.title,
    transcript: c.messages.map((m) => `${m.role === "user" ? "אורן" : "מוח"}: ${m.content}`).join("\n"),
  }));
  // Mark these chats as summarized (even if the LLM call fails we don't want to re-read them every hour)
  if (recentChats.length > 0) {
    await prisma.brainChat.updateMany({
      where: { id: { in: recentChats.map((c) => c.id) } },
      data: { summarizedAt: today, summary: `נקרא על ידי המוח ב-${today.toISOString().split("T")[0]}` },
    });
  }

  // ---- Pull current corpus insights (lightweight subset) ----
  let corpusSummary: any = {};
  try {
    const ci = await computeCorpusInsights();
    corpusSummary = {
      avgTechniques: ci.totals.avgTechniquesPerPrompt,
      avgWords: ci.totals.avgWordsPerPrompt,
      topTechniques: ci.topTechniques.slice(0, 8).map((t) => ({ name: t.name, count: t.count })),
      topStyles: ci.topStyles.slice(0, 5).map((s) => ({ name: s.name, count: s.count })),
      gaps: ci.gaps.slice(0, 4).map((g) => ({ value: g.value, suggestion: g.suggestion })),
      derivedRules: ci.derivedRules.slice(0, 5),
      strategicInsights: ci.strategicInsights?.slice(0, 4) || [],
      upgradesAvgWordDelta: ci.upgrades?.avgWordDelta || 0,
      upgradesTopAddedPhrases: ci.upgrades?.topAddedPhrases?.slice(0, 5).map((p) => p.phrase) || [],
    };
  } catch {}

  const prompt = JSON.stringify(
    {
      todayDate: today.toISOString().split("T")[0],
      snapshot: {
        totalPrompts,
        totalGuides,
        totalNodes,
        totalEmbeddings,
        deltas: {
          promptsAddedToday,
          guidesAddedToday,
          upgradesToday,
          imagesGenToday,
          videosGenToday,
        },
        corpus: corpusSummary,
      },
      recentUserChats: chatsForPrompt,
      last7DaysHistory: history.map((h) => ({
        date: h.date.toISOString().split("T")[0],
        identity: h.identity,
        tomorrowFocus: h.tomorrowFocus,
        weeklyArc: h.weeklyArc,
        maturityScore: h.maturityScore,
        totals: { prompts: h.totalPrompts, guides: h.totalGuides, nodes: h.totalNodes },
      })),
    },
    null,
    2,
  );

  // Try Pro first, fall back to flash-lite on 503/quota
  let parsed: any;
  try {
    parsed = await callGemini(prompt, PRO_MODEL);
  } catch (e: any) {
    console.warn("[brain] Pro failed, falling back:", String(e?.message || e).slice(0, 200));
    parsed = await callGemini(prompt, FALLBACK_MODEL);
  }

  // Save
  const data = {
    date: today,
    totalPrompts,
    totalGuides,
    totalNodes,
    totalEmbeddings,
    promptsAddedToday,
    guidesAddedToday,
    upgradesToday,
    imagesGenToday,
    videosGenToday,
    identity: String(parsed.identity || "").slice(0, 4000),
    todayLearnings: parsed.todayLearnings || [],
    tomorrowFocus: parsed.tomorrowFocus || [],
    weeklyArc: parsed.weeklyArc ? String(parsed.weeklyArc).slice(0, 2000) : null,
    maturityScore: typeof parsed.maturityScore === "number" ? parsed.maturityScore : null,
  };

  const cache = existing
    ? await prisma.dailyBrainCache.update({ where: { date: today }, data })
    : await prisma.dailyBrainCache.create({ data });

  return { cache, newlyCreated: !existing };
}
