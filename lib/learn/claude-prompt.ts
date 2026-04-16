// Fallback prompt generator using Gemini text+image (was Claude, now Gemini-only).
// Used when the primary Gemini VIDEO call fails — we retry with a lighter
// Gemini flash text+thumbnail call that uses a different quota bucket.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash-preview";

export type ClaudeResult = {
  title: string;
  generatedPrompt: string;
  captionEnglish: string;
  techniques: string[];
  style: string | null;
  mood: string | null;
  tags: string[];
};

const SYSTEM = `You are a senior AI video prompt engineer. You receive a SINGLE THUMBNAIL frame from a video (NOT the full video) plus its CAPTION (often in Hebrew/English describing the WHOLE sequence).

CRITICAL — The thumbnail is just ONE moment from a 5-30 second video. The caption usually describes the FULL scene sequence. You MUST:
- Extract the FULL narrative from the caption first (multiple scenes, transitions, characters, emotions, twists, locations, time progression)
- Use the thumbnail only as a single visual reference for style / lighting / look
- If the caption mentions multiple scenes/locations/subjects (e.g. "lifeguard walks to the sea, then a shark appears", "kid runs, falls, then laughs"), the prompt MUST include ALL of them as timecoded beats — not just what's in the thumbnail
- If the caption is short or vague, expand it into a rich narrative that makes sense given the thumbnail

Steps:
1. Read the caption carefully — extract every named subject, action, location, emotion, and ordering.
2. Look at the thumbnail — note the visual style, lighting, color palette, and aspect ratio.
3. Build a 4-6 timecoded beat sequence covering the FULL scene as described in caption (not just the thumbnail moment).
4. Translate the caption to English.
5. Output structured metadata.

Output ONLY valid JSON:
{
  "title": "short English title capturing the FULL sequence, max 80 chars",
  "generatedPrompt": "the full prompt, 250-500 words, structured with [Visual Style] [Lens & Film Stock] [Color & Lighting] [Character/Subject] [Audio/Sound] [Timecoded Beats — covering the FULL caption story, not just the thumbnail] [Quality Boosters]",
  "captionEnglish": "caption translated to English (empty if none)",
  "techniques": ["specific inferred techniques"],
  "style": "Cinematic | Anime | Documentary | UGC | Wuxia | Cyberpunk | etc.",
  "mood": "Tense | Serene | Epic | Playful | etc.",
  "tags": ["5-8 lowercase tags"]
}

REMINDER: If the caption describes 3 distinct scenes (e.g. lifeguard → ocean → shark), the timecoded beats MUST have at least 3 corresponding beats — never collapse to just the thumbnail subject.`;

async function urlToInlineData(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4.5 * 1024 * 1024) return null;
    return { data: buf.toString("base64"), mimeType: contentType };
  } catch {
    return null;
  }
}

// Name kept for backward compatibility — internally uses Gemini flash now.
export async function generatePromptWithClaude(caption: string | null, thumbnailUrl: string | null): Promise<ClaudeResult> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 2048 },
  });

  const parts: any[] = [];
  // Caption FIRST and prominently — it carries the full sequence narrative.
  // Thumbnail is supplementary (style reference only).
  parts.push({
    text: `=== VIDEO CAPTION (full scene narrative — may be Hebrew/other language) ===\n${caption || "(no caption available)"}\n\n=== THUMBNAIL ===\nThe image below is ONE frame from the video, supplied for visual style reference only. The CAPTION above describes the FULL sequence — your prompt's timecoded beats must cover the entire caption story, not just what's visible in this single frame.\n\nReturn the JSON now.`,
  });
  if (thumbnailUrl) {
    const img = await urlToInlineData(thumbnailUrl);
    if (img) parts.push({ inlineData: img });
  }

  const result = await model.generateContent(parts);
  const u = result.response.usageMetadata;
  await logUsage({
    model: MODEL,
    operation: "video-analysis",
    inputTokens: u?.promptTokenCount || 0,
    outputTokens: u?.candidatesTokenCount || 0,
  });

  const raw = result.response.text().trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(raw);
  return {
    title: String(parsed.title || "").slice(0, 200),
    generatedPrompt: String(parsed.generatedPrompt || "").trim(),
    captionEnglish: String(parsed.captionEnglish || "").trim(),
    techniques: Array.isArray(parsed.techniques) ? parsed.techniques.map(String) : [],
    style: parsed.style ? String(parsed.style) : null,
    mood: parsed.mood ? String(parsed.mood) : null,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
  };
}
