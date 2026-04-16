// Rebuilds an existing guide using Gemini with access to the original
// title/description/category + the existing stage titles as a research outline.
// Produces a richer 6-10 stage guide with markdown + fenced code blocks.
// Uses direct v1beta fetch (same as lib/learn/brain/chat) — no SDK dep.

import { logUsage } from "./usage-tracker";
import { langName } from "./guide-languages";

const API_KEY = process.env.GEMINI_API_KEY;
const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

export type EnrichedStage = {
  type: "start" | "middle" | "end";
  title: string;
  content: string;
};

export type EnrichedGuide = {
  title: string;
  description: string;
  category?: string;
  estimatedMinutes?: number;
  stages: EnrichedStage[];
};

export type EnrichInput = {
  title: string;
  description?: string | null;
  category?: string | null;
  existingStageTitles: string[];
  lang?: string;
};

async function callGemini(system: string, user: string): Promise<{ text: string; usage: any; model: string }> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  let lastErr: any = null;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 8192 },
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (res.status === 503 || res.status === 429) {
          lastErr = new Error(`${model} ${res.status}`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          const t = await res.text();
          lastErr = new Error(`${model} ${res.status}: ${t.slice(0, 200)}`);
          break;
        }
        const json: any = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        return { text, usage: json.usageMetadata, model };
      } catch (e: any) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error("all models failed");
}

export async function enrichGuideWithResearch(input: EnrichInput): Promise<EnrichedGuide> {
  const lang = input.lang || "he";
  const existingOutline = input.existingStageTitles.length > 0
    ? `Existing outline of sections (use as research scaffolding, but expand & restructure as needed):\n${input.existingStageTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "(no prior outline — build one from scratch)";

  const SYSTEM = `You are an expert technical writer rebuilding a guide with deep research and rich detail. Output the entire guide in ${langName(lang)} (${lang}).

Return JSON only, no prose before/after:
{
  "title": "<crisp, action-oriented title, Hebrew if lang=he>",
  "description": "<2-3 sentences: what the reader will learn + what the outcome looks like>",
  "category": "<short tag, keep the original if provided>",
  "estimatedMinutes": <integer 5-20 based on stage count/depth>,
  "stages": [
    { "type": "start", "title": "<intro — hook + what's different about this approach>", "content": "<markdown, 200-400 words>" },
    { "type": "middle", "title": "...", "content": "..." },
    ... (4-8 middle stages)
    { "type": "end", "title": "<wrap-up: summary bullets + next steps>", "content": "<markdown>" }
  ]
}

Rules for each stage's content:
- **Length:** 200-400 words per stage. Go deep, don't be superficial.
- **Markdown allowed:** bullet lists (- item), bold (**term**), numbered lists, and fenced code blocks \`\`\`lang\n...\n\`\`\` where genuinely relevant (bash, python, typescript, json, env, etc.).
- **Research mindset:** explain *why* each step exists. Include concrete examples, real command lines, real prompts, real URLs, pitfalls, and pro tips.
- **No code fences for prose-only topics** — use them only for tech / dev guides where copy-paste matters.
- **Hebrew RTL:** flow naturally in Hebrew; keep English tokens (library names, commands) in LTR inline.
- **Total stages:** 6-10 (1 start, 4-8 middle, 1 end).
- **No "As an AI" / meta commentary.** Write as the expert author.`;

  const userMsg = `Original guide title: ${input.title}
Original description: ${input.description ?? "(none — infer from title)"}
Category: ${input.category ?? "(infer)"}

${existingOutline}

Rebuild this guide from scratch with deep research. Keep the spirit of the original title/topic, but expand, clarify, and add concrete detail. Produce the JSON now.`;

  const { text, usage, model } = await callGemini(SYSTEM, userMsg);
  await logUsage({
    model,
    operation: "compose",
    inputTokens: usage?.promptTokenCount || 0,
    outputTokens: usage?.candidatesTokenCount || 0,
    meta: { purpose: "guide-enrich", lang, title: input.title.slice(0, 60) },
  });

  const raw = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(raw);
  if (!parsed.stages || !Array.isArray(parsed.stages)) throw new Error("invalid enrich output");
  return parsed as EnrichedGuide;
}
