import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "./db";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash";

export type ComposedPrompt = {
  prompt: string;
  rationale: string;
  similar: Array<{ id: string; title: string | null; externalId: string | null }>;
  engine?: "gemini" | "claude";
};

function isQuotaError(e: any): boolean {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("expired") || msg.includes("403");
}

async function pickReferences(brief: string, k = 5) {
  const STOP = new Set(["a", "an", "the", "of", "and", "or", "in", "to", "with", "for", "on", "at", "by", "from"]);
  // Hebrew briefs won't match English prompt keywords, so we only use ASCII words here.
  // For Hebrew-only briefs we skip to the latest-prompts fallback.
  const keywords = brief
    .toLowerCase()
    .split(/[\s,.!?;:]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && /^[a-z0-9]+$/.test(w))
    .slice(0, 10);

  const baseWhere = { status: "complete", prompt: { not: "" } };

  if (keywords.length > 0) {
    const candidates = await prisma.learnSource.findMany({
      where: {
        ...baseWhere,
        OR: keywords.flatMap((kw) => [
          { prompt: { contains: kw, mode: "insensitive" as const } },
          { title: { contains: kw, mode: "insensitive" as const } },
        ]),
      },
      take: k * 5,
      orderBy: { createdAt: "desc" },
    });
    if (candidates.length > 0) {
      const scored = candidates.map((c) => {
        const hay = `${c.title || ""}\n${c.prompt}`.toLowerCase();
        let score = 0;
        for (const kw of keywords) score += hay.split(kw).length - 1;
        return { c, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k).map((s) => s.c);
    }
  }

  // Fallback: no keyword match (e.g. Hebrew-only brief) — use top-rated + newest completed prompts
  return prisma.learnSource.findMany({
    where: baseWhere,
    take: k,
    orderBy: [{ userRating: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
}

const SYSTEM_PROMPT = `You are an expert AI video prompt engineer for Seedance 2.0, Sora, Kling, and Veo. You write English prompts ONLY (native language of the engines).

HARD REQUIREMENTS — every prompt you output MUST include ALL of these sections, in this order. No skipping, no merging. Aim for 400–900 words.

1. **Visual Style** — genre + realism level + render style (e.g. "Cinematic photoreal 8K", "Chinese style anime 3D CG IMAX quality", "Gritty post-apocalyptic hyperrealistic")
2. **Film Stock & Lens** — explicit camera/lens/aperture (e.g. "Shot on 35mm anamorphic, f/2.8, shallow depth of field")
3. **Color Palette & Grade** — concrete colors + grade (e.g. "Teal-orange desaturated, dusty earthy undertones" / "Dark cyan + amber + emerald, high contrast")
4. **Lighting & Atmosphere** — light type + direction + volumetric/particles (e.g. "Dramatic volumetric Golden Hour with dust motes and heat haze")
5. **Character / Subject** — detailed physical description: age, build, wardrobe texture, hair, skin detail, expression, consistency note ("face and clothing remain consistent throughout, no drift/artifacts")
6. **Audio / Sound Design** — explicit SFX list: foreground sounds, ambient bed, impact moments, any diegetic dialogue with whispered lines in quotes
7. **Timeline — timecoded beats** — MANDATORY. Break the duration into 3–5 beats, each: \`[0-3s]\`, \`[3-6s]\`, etc. For each beat specify:
   - Shot Type (ECU / OTS / POV / Macro / Wide / Tracking / Dolly / Crane etc.)
   - Camera movement (push-in, pull-back, orbit, handheld, whip-pan)
   - Visual Content (what happens, micro-expressions, physical action)
   - Any sound cue tied to that beat
8. **Quality Boosters** (final line) — "Photorealistic 8K, ultra-detailed textures, perfect motion blur, high dynamic range, no artifacts, coherent motion, consistent character identity"

STRUCTURE & STYLE:
- Use clear section headers (bold or ALL-CAPS) exactly as above.
- Prefer rich cinematic language: "volumetric light", "shallow depth of field", "anamorphic flare", "slow-motion 120fps", "whip pan", "film grain", "HDR", "bokeh".
- Reference prompts are for style/structure calibration — do NOT copy their content, only their level of detail and technical language.
- If the user's brief is short ("a cat on a roof"), YOU fill in all 8 layers with cinematically appropriate choices.

OUTPUT: valid JSON only, no markdown fencing:
{
  "prompt": "<full prompt, 400-900 words, all 8 sections present>",
  "rationale": "<Hebrew paragraph explaining which reference techniques you reused and why>"
}

Self-check before returning: count the sections. If any of the 8 is missing, rewrite before emitting.`;

function buildUserMsg(brief: string, refs: Array<{ title: string | null; prompt: string }>): string {
  const referenceBlock = refs
    .map((r, i) => `--- REFERENCE ${i + 1}${r.title ? ` (${r.title})` : ""} ---\n${r.prompt.slice(0, 800).trim()}`)
    .join("\n\n");
  return `User's brief:\n${brief.trim()}\n\nReference prompts from Seedance 2.0 library (use for style, structure, and detail level; do NOT copy content):\n\n${referenceBlock}\n\nReturn JSON now.`;
}

function parseComposeJson(raw: string): { prompt: string; rationale: string } {
  let cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  // Walk braces/brackets to extract the first complete top-level JSON value
  // (Gemini sometimes appends prose or returns extra siblings).
  const open = cleaned[0];
  if (open === "{" || open === "[") {
    const closeChar = open === "{" ? "}" : "]";
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === open) depth++;
        else if (c === closeChar) {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
    }
    if (end > 0) cleaned = cleaned.slice(0, end);
  }
  let parsed = JSON.parse(cleaned);
  // Gemini may wrap in an array — unwrap to the first object
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== "object") throw new Error("model returned non-object response");
  // Tolerate alternate key names
  const promptVal = parsed.prompt || parsed.upgradedPrompt || parsed.text || parsed.output;
  if (!promptVal) throw new Error(`model did not return a prompt field (got keys: ${Object.keys(parsed).join(",")})`);
  return { prompt: String(promptVal).trim(), rationale: String(parsed.rationale || parsed.reason || "").trim() };
}

function missingSections(prompt: string): string[] {
  const missing: string[] = [];
  const p = prompt.toLowerCase();
  if (!/\b(shot on|lens|anamorphic|f\/\d|aperture|\d+mm)\b/.test(p)) missing.push("Film Stock & Lens");
  if (!/\b(color palette|color grade|grade|teal|desaturated|warm tones|cool tones|hdr)\b/.test(p)) missing.push("Color Palette & Grade");
  if (!/\b(lighting|volumetric|golden hour|backlit|rim light|key light|ambient|soft light)\b/.test(p)) missing.push("Lighting & Atmosphere");
  if (!/\b(sound|audio|sfx|ambient|foley|score|whisper|dialogue)\b/.test(p)) missing.push("Audio / Sound Design");
  if (!/\[\s*\d{1,2}\s*[-–]\s*\d{1,2}\s*s?\s*\]|\b\d{1,2}\s*[-–]\s*\d{1,2}s\b|\b0-\d+\s*seconds?\b/.test(prompt)) missing.push("Timeline (timecoded beats)");
  if (!/\b(8k|photoreal|ultra-detailed|no artifacts|motion blur|high dynamic range)\b/.test(p)) missing.push("Quality Boosters");
  return missing;
}

async function composeWithGemini(brief: string, refs: any[]): Promise<ComposedPrompt> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json", temperature: 0.8, maxOutputTokens: 4096 },
  });

  let userMsg = buildUserMsg(brief, refs);
  let parsed: { prompt: string; rationale: string } | null = null;
  let lastUsage: any = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await model.generateContent(userMsg);
    lastUsage = result.response.usageMetadata;
    const rawText = result.response.text();
    console.log(`[compose] attempt ${attempt + 1} raw response (first 500 chars):`, rawText.slice(0, 500));
    const p = parseComposeJson(rawText);
    const wordCount = p.prompt.split(/\s+/).length;
    const missing = missingSections(p.prompt);
    if (wordCount >= 350 && missing.length === 0) {
      parsed = p;
      break;
    }
    if (attempt === 0) {
      userMsg = `${userMsg}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION.\n- Word count: ${wordCount} (need ≥350)\n- Missing required sections: ${missing.join(", ") || "none"}\nRewrite the prompt so ALL 8 sections are present with explicit markers, and total length 400–900 words. Return JSON.`;
    } else {
      parsed = p;
    }
  }

  await logUsage({
    model: MODEL, operation: "compose",
    inputTokens: lastUsage?.promptTokenCount || 0,
    outputTokens: lastUsage?.candidatesTokenCount || 0,
  });

  const { prompt, rationale } = parsed!;
  return {
    prompt, rationale,
    similar: refs.map((r) => ({ id: r.id, title: r.title, externalId: r.externalId })),
    engine: "gemini",
  };
}

export async function composePrompt(brief: string): Promise<ComposedPrompt> {
  if (!brief || brief.trim().length < 5) throw new Error("Brief קצר מדי");
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");

  const refs = await pickReferences(brief, 5);
  if (refs.length === 0) throw new Error("אין מספיק פרומפטים ב-DB. הרץ סנכרון קודם.");

  return composeWithGemini(brief, refs);
}

export async function suggestSimilar(
  sourceId: string,
  count = 3,
  onProgress?: (i: number, total: number, elapsedMs: number) => Promise<void>,
): Promise<ComposedPrompt[]> {
  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("source not found");

  const brief = `Create ${count} distinct variations inspired by this prompt (different subjects or scenes, same style/structure):\n\n${source.prompt.slice(0, 800)}`;

  const results: ComposedPrompt[] = [];
  const errors: string[] = [];
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    if (onProgress) await onProgress(i, count, Date.now() - t0);
    try {
      const c = await composePrompt(brief);
      results.push(c);
    } catch (e: any) {
      const msg = String(e?.message || e).slice(0, 200);
      errors.push(`#${i + 1}: ${msg}`);
      console.error(`[suggestSimilar] variation ${i + 1} failed:`, msg);
    }
  }
  if (onProgress) await onProgress(count, count, Date.now() - t0);
  if (results.length === 0 && errors.length > 0) {
    throw new Error(errors.join(" | "));
  }
  return results;
}
