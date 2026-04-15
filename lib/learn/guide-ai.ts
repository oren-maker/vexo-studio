// Guide-related AI helpers using Gemini Flash.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logUsage } from "./usage-tracker";
import { langName } from "./guide-languages";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-flash-latest";

function genAI() {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  return new GoogleGenerativeAI(API_KEY);
}

export type AiGuideStructure = {
  title: string;
  description: string;
  category?: string;
  estimatedMinutes?: number;
  stages: Array<{ type: "start" | "middle" | "end"; title: string; content: string }>;
};

export async function generateGuideFromTopic(topic: string, lang: string): Promise<AiGuideStructure> {
  const SYSTEM = `You are an expert technical writer creating a step-by-step guide. Output the entire guide in ${langName(lang)} (${lang}).

Return JSON only:
{
  "title": "<short, action-oriented>",
  "description": "<1-2 sentences explaining what the reader will learn>",
  "category": "<short tag e.g. 'AI', 'Video Editing', 'Cooking'>",
  "estimatedMinutes": <integer 3-15>,
  "stages": [
    { "type": "start", "title": "<intro stage>", "content": "<paragraph + bullet points using markdown>" },
    { "type": "middle", "title": "...", "content": "..." },
    ... (3-5 middle stages)
    { "type": "end", "title": "<wrap-up>", "content": "<summary + next steps>" }
  ]
}

Total 5-7 stages. Each content 100-250 words, with markdown bullets where helpful. No code fences. Use ${lang === "he" ? "RTL Hebrew" : lang === "ar" ? "RTL Arabic" : "natural prose"}.`;

  const model = genAI().getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 3000 },
  });
  const result = await model.generateContent(`Topic: ${topic}\n\nReturn the guide JSON now.`);
  const u = result.response.usageMetadata;
  await logUsage({
    model: MODEL, operation: "compose",
    inputTokens: u?.promptTokenCount || 0,
    outputTokens: u?.candidatesTokenCount || 0,
    meta: { purpose: "guide-from-topic", lang },
  });
  const raw = result.response.text().trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed[0];
  return parsed;
}

export async function generateStageContent(guideTitle: string, stageTitle: string, lang: string): Promise<string> {
  const SYSTEM = `You write a single guide stage in ${langName(lang)} (${lang}). Output 100-250 words. Use markdown bullets where helpful. No code fences. Output ONLY the stage body text.`;
  const model = genAI().getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { temperature: 0.6, maxOutputTokens: 512 },
  });
  const result = await model.generateContent(`Guide topic: ${guideTitle}\nThis stage's title: ${stageTitle}\n\nWrite the stage body now.`);
  const u = result.response.usageMetadata;
  await logUsage({
    model: MODEL, operation: "compose",
    inputTokens: u?.promptTokenCount || 0,
    outputTokens: u?.candidatesTokenCount || 0,
    meta: { purpose: "guide-stage-content", lang },
  });
  return result.response.text().trim();
}
