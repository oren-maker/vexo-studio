import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash-preview";

export type ExtractedFromVideo = {
  title: string;
  generatedPrompt: string; // A usable Sora/Seedance-style prompt reconstructing the video
  captionEnglish: string;  // Original caption translated to English (if Hebrew/other)
  techniques: string[];
  style: string | null;
  mood: string | null;
  tags: string[];
};

const SYSTEM = `You are a senior AI video prompt engineer. You will watch an instructor's video and read their original caption (which may be in Hebrew or another language).

Your job:
1. Understand what the video shows.
2. Produce ONE production-ready video generation prompt (for Sora 2 / Seedance 2.0 style) that would recreate a similar result. Use timecoded beats, specific camera language, lighting, mood, and technical specs.
3. Translate the caption to English.
4. Extract structured metadata.

Output ONLY valid JSON with this exact shape:
{
  "title": "short English title (max 80 chars)",
  "generatedPrompt": "the full video prompt (150-400 words, structured with [Style] [Scene] [Character] [Shots] [Camera] [Effects] [Audio] [Technical])",
  "captionEnglish": "the original caption translated to English (or empty if no caption)",
  "techniques": ["specific techniques observed/inferred"],
  "style": "Cinematic | Anime | Documentary | UGC | Wuxia | Cyberpunk | etc.",
  "mood": "Tense | Serene | Epic | Playful | Dramatic | etc.",
  "tags": ["5-8 lowercase searchable tags"]
}

No markdown, no commentary, JSON only.`;

async function downloadToTmp(url: string): Promise<{ path: string; size: number; mimeType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 vexo-learn" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`fetch video ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = (res.headers.get("content-type") || "video/mp4").split(";")[0].trim();
  const tmpPath = path.join(os.tmpdir(), `vxlearn-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  await fs.writeFile(tmpPath, buffer);
  return { path: tmpPath, size: buffer.length, mimeType: contentType || "video/mp4" };
}

export async function extractPromptFromVideo(
  videoUrl: string,
  caption: string | null
): Promise<ExtractedFromVideo> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");

  const tmp = await downloadToTmp(videoUrl);
  const fileManager = new GoogleAIFileManager(API_KEY);
  let uploaded;
  try {
    uploaded = await fileManager.uploadFile(tmp.path, {
      mimeType: tmp.mimeType,
      displayName: `ig-${Date.now()}`,
    });
  } finally {
    fs.unlink(tmp.path).catch(() => {});
  }

  let file = uploaded.file;
  const start = Date.now();
  while (file.state === FileState.PROCESSING) {
    if (Date.now() - start > 4 * 60 * 1000) throw new Error("Gemini upload timeout");
    await new Promise((r) => setTimeout(r, 3000));
    file = await fileManager.getFile(file.name);
  }
  if (file.state !== FileState.ACTIVE) throw new Error(`Gemini file state: ${file.state}`);

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
  });

  const userMsg = caption
    ? `Caption (may be Hebrew/other language):\n${caption}`
    : "No caption provided. Base analysis purely on the video.";

  const result = await model.generateContent([
    { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
    { text: userMsg },
  ]);

  const text = result.response.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  // cleanup Gemini file
  try { await fileManager.deleteFile(file.name); } catch {}

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
