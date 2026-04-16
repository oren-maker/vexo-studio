import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./db";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash";

type AnalysisShape = {
  description: string;
  techniques: string[];
  style: string | null;
  mood: string | null;
  difficulty: string | null;
  howTo: string[];
  tags: string[];
  insights: string[];
};

const SYSTEM = `You are a senior video prompt engineer. Read the given Seedance 2.0 / AI video prompt
and extract structured knowledge from it. Output ONLY valid JSON matching:

{
  "description": "2-3 sentence summary of what the prompt generates",
  "techniques": ["specific filming/editing/VFX techniques named in the prompt"],
  "style": "overall visual style (cinematic, documentary, anime, UGC, wuxia, etc.)",
  "mood": "emotional tone (tense, serene, euphoric, ominous, etc.)",
  "difficulty": "beginner | intermediate | advanced",
  "howTo": ["step-by-step instructions to recreate this shot"],
  "tags": ["5-10 searchable lowercase tags"],
  "insights": ["actionable lessons a prompt writer can learn from this example"]
}

Rules:
- Each techniques/howTo/insights item is a full, concrete sentence — not a keyword.
- techniques should name real camera/lens/lighting/VFX moves (e.g. "anamorphic 35mm lens with teal-orange color grade", "ultra-slow-motion ring-shaped shockwave on weapon clash").
- insights should teach the reader HOW to write better prompts (e.g. "Pair sensory sound design with visual beats to deepen immersion").
- tags lowercase, no spaces (use-hyphens).
- difficulty based on how many advanced techniques/timing beats are needed.
- No markdown, no commentary, JSON only.`;

export async function extractKnowledgeFromPromptText(
  promptText: string
): Promise<AnalysisShape> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  const result = await model.generateContent(promptText.slice(0, 6000));
  const u = result.response.usageMetadata;
  await logUsage({
    model: MODEL, operation: "knowledge-extract",
    inputTokens: u?.promptTokenCount || 0,
    outputTokens: u?.candidatesTokenCount || 0,
  });
  const raw = result.response.text();
  const parsed = JSON.parse(raw);
  return {
    description: String(parsed.description || ""),
    techniques: Array.isArray(parsed.techniques) ? parsed.techniques.map(String) : [],
    style: parsed.style ? String(parsed.style) : null,
    mood: parsed.mood ? String(parsed.mood) : null,
    difficulty: parsed.difficulty ? String(parsed.difficulty) : null,
    howTo: Array.isArray(parsed.howTo) ? parsed.howTo.map(String) : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    insights: Array.isArray(parsed.insights) ? parsed.insights.map(String) : [],
  };
}

function analysisToNodes(
  analysis: AnalysisShape,
  analysisId: string
) {
  const nodes: Array<{
    type: string;
    title: string;
    body: string;
    tags: string[];
    confidence: number;
    analysisId: string;
  }> = [];

  for (const t of analysis.techniques) {
    nodes.push({
      type: "technique",
      title: t.slice(0, 120),
      body: t,
      tags: [...analysis.tags, analysis.style || ""].filter(Boolean),
      confidence: 0.82,
      analysisId,
    });
  }
  if (analysis.style) {
    nodes.push({
      type: "style",
      title: `Style: ${analysis.style}`,
      body: analysis.description,
      tags: [analysis.style, analysis.mood || "", ...analysis.tags].filter(Boolean),
      confidence: 0.85,
      analysisId,
    });
  }
  for (const step of analysis.howTo) {
    nodes.push({
      type: "how_to",
      title: step.slice(0, 120),
      body: step,
      tags: analysis.tags,
      confidence: 0.78,
      analysisId,
    });
  }
  for (const ins of analysis.insights) {
    nodes.push({
      type: "insight",
      title: ins.slice(0, 120),
      body: ins,
      tags: analysis.tags,
      confidence: 0.8,
      analysisId,
    });
  }
  return nodes;
}

// An analysis is considered "thin" if it was produced by pattern extraction
// and lacks insights / howTo — i.e. it's shallow tagging, not real learning.
function isThinAnalysis(a: { rawGemini: string; insights: string[]; howTo: string[]; techniques: string[] } | null): boolean {
  if (!a) return true;
  if (a.rawGemini?.includes("pattern-extractor")) return true;
  if (a.insights.length === 0 && a.howTo.length === 0) return true;
  if (a.techniques.length === 0) return true;
  return false;
}

// Process one source: call Gemini, create or REPLACE VideoAnalysis + KnowledgeNodes
// when the current analysis is missing or thin.
export async function extractForSource(
  sourceId: string,
  opts: { force?: boolean } = {},
): Promise<{ created: boolean; nodeCount: number; error?: string }> {
  const source = await prisma.learnSource.findUnique({
    where: { id: sourceId },
    include: { analysis: true },
  });
  if (!source) return { created: false, nodeCount: 0, error: "not found" };
  if (!opts.force && source.analysis && !isThinAnalysis(source.analysis)) {
    return { created: false, nodeCount: 0, error: "already rich" };
  }

  try {
    const analysis = await extractKnowledgeFromPromptText(source.prompt);

    if (source.analysis) {
      // Replace the thin analysis
      await prisma.knowledgeNode.deleteMany({ where: { analysisId: source.analysis.id } });
      await prisma.videoAnalysis.delete({ where: { id: source.analysis.id } });
    }

    const saved = await prisma.videoAnalysis.create({
      data: {
        sourceId: source.id,
        description: analysis.description,
        techniques: analysis.techniques,
        howTo: analysis.howTo,
        tags: analysis.tags,
        style: analysis.style,
        mood: analysis.mood,
        difficulty: analysis.difficulty,
        insights: analysis.insights,
        promptAlignment: null,
        rawGemini: JSON.stringify({ engine: "gemini-flash", ...analysis }),
      },
    });
    const nodes = analysisToNodes(analysis, saved.id);
    if (nodes.length > 0) {
      await prisma.knowledgeNode.createMany({ data: nodes });
    }
    return { created: true, nodeCount: nodes.length };
  } catch (e: any) {
    return { created: false, nodeCount: 0, error: String(e.message || e).slice(0, 200) };
  }
}

// Batch process all sources without rich analysis. Sequential, 2s delay.
// thinOnly=true picks up sources missing analysis OR with pattern-only analysis.
export async function extractAllPending(limit = 300, thinOnly = true): Promise<{
  processed: number;
  created: number;
  totalNodes: number;
  errors: string[];
}> {
  // Fetch ALL complete sources with current analysis, then filter in JS to catch "thin" cases.
  const candidates = await prisma.learnSource.findMany({
    where: { status: "complete" },
    include: { analysis: true },
    take: limit * 2,
  });
  const pending = candidates.filter((s) => !s.analysis || (thinOnly && isThinAnalysis(s.analysis))).slice(0, limit);

  let created = 0;
  let totalNodes = 0;
  const errors: string[] = [];

  for (const source of pending) {
    const r = await extractForSource(source.id);
    if (r.created) {
      created++;
      totalNodes += r.nodeCount;
    } else if (r.error && r.error !== "already has analysis") {
      errors.push(`${source.externalId || source.id}: ${r.error}`);
    }
    // Gemini Flash free tier: 15 RPM. Pause ~2s between calls to stay safe.
    await new Promise((r) => setTimeout(r, 2000));
  }

  return { processed: pending.length, created, totalNodes, errors };
}
