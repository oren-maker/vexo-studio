// Server-side scene rating using Gemini Flash (text+image).
// Rates each scene 1-10 based on visual interest, motion, composition.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash-preview";

const SYSTEM = `You are a video editor. You receive ONE thumbnail frame from a scene. Rate it 1-10 for visual interest, composition, emotional impact, and editing value.

Output ONLY valid JSON:
{ "rating": 7, "reason": "<short Hebrew sentence — what makes it interesting or weak>" }

Guidelines:
- 9-10: cinematic moment, strong composition, peak action/emotion
- 6-8: clear subject, good framing, moderate interest
- 4-5: average, transitional, "establishing" shots
- 1-3: blurry, empty, transitional throwaway, or pure black/white frames`;

async function urlToInlineData(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return null;
    return { data: buf.toString("base64"), mimeType: ct };
  } catch {
    return null;
  }
}

export async function rateScene(thumbnailUrl: string): Promise<{ rating: number; reason: string }> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  const img = await urlToInlineData(thumbnailUrl);
  if (!img) return { rating: 5, reason: "תמונה לא נטענה — דירוג ברירת מחדל" };

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 256 },
  });

  const result = await model.generateContent([
    { inlineData: img },
    { text: "Rate this scene now." },
  ]);
  const u = result.response.usageMetadata;
  await logUsage({
    model: MODEL,
    operation: "video-analysis",
    inputTokens: u?.promptTokenCount || 0,
    outputTokens: u?.candidatesTokenCount || 0,
  });

  const raw = result.response.text().trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(raw);
    const rating = Math.max(1, Math.min(10, Math.round(Number(parsed.rating) || 5)));
    return { rating, reason: String(parsed.reason || "").slice(0, 300) };
  } catch {
    return { rating: 5, reason: "פענוח נכשל — דירוג ברירת מחדל" };
  }
}
