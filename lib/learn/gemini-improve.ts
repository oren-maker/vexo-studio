import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./db";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash";

export type ImprovementResult = {
  scores: {
    structure: number;      // 1-10 - blocks/timecodes/clarity
    cinematic: number;      // lens, lighting, color, composition
    specificity: number;    // concrete vs vague language
    sensoryDetail: number;  // sound, atmosphere, mood, texture
    technical: number;      // resolution, aspect, duration
    overall: number;
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: Array<{ kind: "add" | "replace" | "remove"; what: string; why: string }>;
  improvedPrompt: string;
  diffSummary: string;
  referencesUsed: Array<{ id: string; title: string | null; externalId: string | null }>;
};

async function pickReferences(brief: string, k = 4) {
  const STOP = new Set(["a", "an", "the", "of", "and", "or", "in", "to", "with", "for", "on", "at", "by", "from"]);
  const keywords = brief
    .toLowerCase()
    .split(/[\s,.!?;:]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .slice(0, 12);

  if (keywords.length === 0) {
    return prisma.learnSource.findMany({
      where: { type: "cedance", status: "complete" },
      take: k,
      orderBy: { createdAt: "desc" },
    });
  }

  const candidates = await prisma.learnSource.findMany({
    where: {
      type: "cedance",
      status: "complete",
      OR: keywords.flatMap((kw) => [
        { prompt: { contains: kw, mode: "insensitive" as const } },
        { title: { contains: kw, mode: "insensitive" as const } },
      ]),
    },
    take: k * 5,
  });

  const scored = candidates.map((c) => {
    const hay = `${c.title || ""}\n${c.prompt}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) score += hay.split(kw).length - 1;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.c);
}

function buildSystem() {
  return `You are a senior AI video prompt engineer and coach. You review user-submitted prompts
against a curated library of Seedance 2.0 reference prompts and produce a structured critique.

Score each dimension 1-10:
- structure: uses blocks ([Style]/[Scene]/[Shots]/[Camera]) or timecoded beats [00:00-00:05]; clear flow
- cinematic: specific lens, lighting, color grade, composition, motion
- specificity: concrete nouns/verbs vs vague adjectives; named techniques; precise camera moves
- sensoryDetail: sound design, atmosphere, micro-expressions, texture, mood
- technical: resolution (720p/1080p/4K/8K), aspect ratio (16:9/9:16), duration (4-15s)
- overall: weighted holistic score

Then produce:
- 2-4 STRENGTHS (brief, specific - what the user did well)
- 2-5 WEAKNESSES (brief, specific - what is missing or weak)
- 3-6 CONCRETE SUGGESTIONS, each with kind (add/replace/remove), what (the change), why (the impact)
- IMPROVED PROMPT: a rewritten version that applies all suggestions; keep user's core idea, match reference style
- DIFF SUMMARY: one short paragraph in Hebrew comparing original vs improved

Output ONLY valid JSON matching this exact schema:
{
  "scores": { "structure": 7, "cinematic": 6, "specificity": 5, "sensoryDetail": 4, "technical": 8, "overall": 6 },
  "strengths": ["..."],
  "weaknesses": ["..."],
  "suggestions": [{ "kind": "add", "what": "...", "why": "..." }],
  "improvedPrompt": "...",
  "diffSummary": "..."
}`;
}

function buildUserMsg(userPrompt: string, refs: Array<{ title: string | null; prompt: string }>): string {
  const referenceBlock = refs
    .map((r, i) => `--- REFERENCE ${i + 1}${r.title ? ` (${r.title})` : ""} ---\n${r.prompt.slice(0, 700).trim()}`)
    .join("\n\n");
  return `Evaluate and improve the following user prompt. Use the references only as style/structure examples (do not copy content).\n\n=== USER PROMPT ===\n${userPrompt.trim()}\n\n=== REFERENCES ===\n${referenceBlock}\n\nReturn the JSON now.`;
}

function parseImproveJson(raw: string): any {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function improveWithGemini(userPrompt: string, refs: any[]) {
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: buildSystem(),
    generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
  });
  const result = await model.generateContent(buildUserMsg(userPrompt, refs));
  const u = result.response.usageMetadata;
  await logUsage({
    model: MODEL, operation: "improve",
    inputTokens: u?.promptTokenCount || 0,
    outputTokens: u?.candidatesTokenCount || 0,
  });
  return parseImproveJson(result.response.text());
}

export async function improvePrompt(userPrompt: string): Promise<ImprovementResult> {
  if (!userPrompt || userPrompt.trim().length < 10) throw new Error("פרומפט קצר מדי");
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");

  const refs = await pickReferences(userPrompt, 4);
  const parsed: any = await improveWithGemini(userPrompt, refs);

  return {
    scores: {
      structure: Number(parsed.scores?.structure) || 0,
      cinematic: Number(parsed.scores?.cinematic) || 0,
      specificity: Number(parsed.scores?.specificity) || 0,
      sensoryDetail: Number(parsed.scores?.sensoryDetail) || 0,
      technical: Number(parsed.scores?.technical) || 0,
      overall: Number(parsed.scores?.overall) || 0,
    },
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((s: any) => ({
          kind: ["add", "replace", "remove"].includes(s.kind) ? s.kind : "add",
          what: String(s.what || ""),
          why: String(s.why || ""),
        }))
      : [],
    improvedPrompt: String(parsed.improvedPrompt || "").trim(),
    diffSummary: String(parsed.diffSummary || "").trim(),
    referencesUsed: refs.map((r) => ({ id: r.id, title: r.title, externalId: r.externalId })),
  };
}
