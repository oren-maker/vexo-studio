// Adapts a rich multi-beat prompt (Seedance/Sora style) into a single-shot
// VEO-optimized prompt. VEO 3 produces one continuous shot and doesn't handle
// timecoded beats well — it tries to literalize the structure instead of
// treating it as a narrative.
//
// Uses Gemini Flash (cheap, fast, reliable) to rewrite the prompt as:
// - A single cohesive paragraph describing ONE shot
// - Dense with visual cues (lens, lighting, motion, color, mood)
// - Explicit character description for face consistency
// - No brackets, no timecodes, no [Style] tags

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash-preview";

const SYSTEM = `You rewrite rich multi-beat video prompts (Seedance / Sora format with timecodes and section tags) into VEO 3 single-shot prompts.

VEO 3 rules:
- Generates ONE continuous 8-second shot — NOT a multi-beat sequence
- Works best with a single cohesive paragraph of visual description
- DOES NOT handle [Style]/[Scene]/[Character]/[Shots] brackets well
- DOES NOT follow timecoded beats [00:00-00:05] literally
- DOES benefit from: specific camera language, lens, lighting, color grade,
  character appearance (face, clothing, build), motion, mood
- Character consistency: describe the character's physical attributes CLEARLY
  so VEO produces the intended subject

Your output:
- ONE paragraph, 100-200 words
- English, no Hebrew
- Concentrate the essence of the prompt into the SINGLE most cinematic moment
- Pick the strongest beat from the timecoded sequence (usually the climax
  or the most visually dense one) and expand it
- Preserve: character appearance, location, lighting, camera, mood
- Drop: structural tags, timecodes, audio design (VEO 3 has audio but the
  text description doesn't control it), technical spec lines

Return ONLY the paragraph — no JSON, no markdown, no commentary.`;

export async function adaptPromptForVEO(richPrompt: string, sourceId?: string): Promise<string> {
  if (!API_KEY) {
    // Fallback: strip obvious structural markers locally
    return localFallback(richPrompt);
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM,
      generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
    });

    const result = await model.generateContent(richPrompt.slice(0, 5000));
    const u = result.response.usageMetadata;
    await logUsage({
      model: MODEL,
      operation: "translate",
      inputTokens: u?.promptTokenCount || 0,
      outputTokens: u?.candidatesTokenCount || 0,
      sourceId,
      meta: { purpose: "veo-adaptation" },
    });

    const adapted = result.response.text().trim();
    if (adapted.length < 40) return localFallback(richPrompt);
    return adapted;
  } catch {
    return localFallback(richPrompt);
  }
}

// Heuristic fallback if Gemini is unavailable. Strip brackets & timecodes,
// keep the longest descriptive paragraph.
function localFallback(p: string): string {
  let cleaned = p
    .replace(/\[[A-Za-z][^\]]*\]/g, "")               // [Style] [Scene] etc.
    .replace(/\[?\d{1,2}[:.]\d{2}(?:-\d{1,2}[:.]\d{2})?\]?/g, "") // timecodes
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Drop technical spec lines
  cleaned = cleaned
    .split("\n")
    .filter((line) => !/^(Technical|Audio|Duration|Aspect|Resolution)[\s:]/i.test(line.trim()))
    .join("\n")
    .trim();
  // Flatten to a single paragraph
  return cleaned.replace(/\n+/g, " ").replace(/\s+/g, " ").slice(0, 1500);
}
