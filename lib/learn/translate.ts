// Generic Gemini translation via direct REST.
// Uses gemini-2.0-flash (no chain-of-thought / thinking mode) for fast, deterministic translation.

import { prisma } from "./db";
import { logUsage } from "./usage-tracker";
import { langName } from "./guide-languages";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash-preview";

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!API_KEY || !text.trim()) return text;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const body = {
      systemInstruction: {
        parts: [{
          text: `You are a translator. Output ONLY the translated text, in ${langName(targetLang)}. Preserve markdown, URLs, emojis, code blocks. No explanations, no commentary, no thinking, no quotes around the result.`,
        }],
      },
      contents: [{ role: "user", parts: [{ text: text.slice(0, 12000) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn("[translate]", res.status, (await res.text()).slice(0, 200));
      return text;
    }
    const json: any = await res.json();
    await logUsage({
      model: MODEL,
      operation: "translate",
      inputTokens: json.usageMetadata?.promptTokenCount || 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
      meta: { targetLang },
    });
    const out = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return out.trim();
  } catch (e: any) {
    console.warn("[translate] failed:", String(e?.message || e).slice(0, 200));
    return text;
  }
}

// Translate the entire guide (title/desc/summary + all stage titles+contents) to targetLang.
// Idempotent: skips fields already translated (unless force=true).
export async function translateGuideToLang(guideId: string, targetLang: string, force = false): Promise<void> {
  const guide = await prisma.guide.findUnique({
    where: { id: guideId },
    include: {
      translations: true,
      stages: { include: { translations: true }, orderBy: { order: "asc" } },
    },
  });
  if (!guide) return;
  const sourceLang = guide.defaultLang;
  const sourceGuideTrans = guide.translations.find((t) => t.lang === sourceLang);
  if (!sourceGuideTrans) return;

  const existingGuideTrans = guide.translations.find((t) => t.lang === targetLang);
  if (!existingGuideTrans || force) {
    const [tTitle, tDesc, tSummary] = await Promise.all([
      translateText(sourceGuideTrans.title, targetLang),
      sourceGuideTrans.description ? translateText(sourceGuideTrans.description, targetLang) : Promise.resolve(null),
      sourceGuideTrans.summary ? translateText(sourceGuideTrans.summary, targetLang) : Promise.resolve(null),
    ]);
    await prisma.guideTranslation.upsert({
      where: { guideId_lang: { guideId, lang: targetLang } },
      create: { guideId, lang: targetLang, title: tTitle, description: tDesc, summary: tSummary, isAuto: true },
      update: { title: tTitle, description: tDesc, summary: tSummary, isAuto: true },
    });
  }

  for (const stage of guide.stages) {
    const sourceTrans = stage.translations.find((t) => t.lang === sourceLang);
    if (!sourceTrans) continue;
    const existing = stage.translations.find((t) => t.lang === targetLang);
    if (existing && !force) continue;
    const [tTitle, tContent] = await Promise.all([
      translateText(sourceTrans.title, targetLang),
      translateText(sourceTrans.content, targetLang),
    ]);
    await prisma.guideStageTranslation.upsert({
      where: { stageId_lang: { stageId: stage.id, lang: targetLang } },
      create: { stageId: stage.id, lang: targetLang, title: tTitle, content: tContent, isAuto: true },
      update: { title: tTitle, content: tContent, isAuto: true },
    });
  }
}
