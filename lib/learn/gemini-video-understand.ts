// Gemini 2.5 Flash video understanding — give Gemini the actual video file
// (via Files API) and get back scene boundaries + descriptions + ratings in
// ONE shot. Replaces the local FFmpeg scene-detection + per-thumbnail rating.
//
// Files API docs: https://ai.google.dev/api/files

import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3-flash"; // supports video input via fileData

const SYSTEM = `You are a video editor analyzing a SINGLE video to identify its distinct scenes.

Return JSON ONLY with this shape:
{
  "scenes": [
    {
      "startSec": 0.0,
      "endSec": 4.2,
      "description": "<short Hebrew sentence — what happens in this scene>",
      "rating": 7,
      "reason": "<one Hebrew sentence — why this rating>",
      "suggestedKeep": true
    }
  ],
  "totalDuration": 23.5,
  "summary": "<2-3 sentence Hebrew overview of the whole video>"
}

Rules:
- Scenes are continuous shots between cuts. A 30s video typically has 3-12 scenes.
- Rating 1-10 for visual interest, composition, emotional impact, editing value:
  - 9-10: cinematic peak moment
  - 6-8: clear subject, good framing
  - 4-5: average / transitional
  - 1-3: blurry, empty, throwaway
- suggestedKeep: true if rating >= 5 OR if removing breaks narrative continuity
- startSec/endSec must be precise to ±0.5s based on the actual video timeline
- Always cover the WHOLE video duration (no gaps between scenes)
- 3-15 scenes is typical; never more than 25

Output JSON only, no markdown fences.`;

type FileUploadResult = { uri: string; name: string; mimeType: string };

async function uploadVideoToFilesApi(videoUrl: string): Promise<FileUploadResult> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");

  // 1. Download the video bytes (from Vercel Blob — already public)
  const dlRes = await fetch(videoUrl);
  if (!dlRes.ok) throw new Error(`download video ${dlRes.status}`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());
  const mimeType = (dlRes.headers.get("content-type") || "video/mp4").split(";")[0].trim();

  // 2. Start resumable upload — initial POST to get upload URL
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buffer.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: `video-${Date.now()}` } }),
    },
  );
  if (!startRes.ok) throw new Error(`files-api start ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`);
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("files-api: no upload URL header");

  // 3. Upload the bytes + finalize
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer,
  });
  if (!upRes.ok) throw new Error(`files-api upload ${upRes.status}: ${(await upRes.text()).slice(0, 300)}`);
  const upJson: any = await upRes.json();
  const uri = upJson?.file?.uri;
  const name = upJson?.file?.name;
  const finalMime = upJson?.file?.mimeType || mimeType;
  if (!uri) throw new Error("files-api: response had no file.uri");

  // 4. Poll until file state is ACTIVE (videos take 5-30s to process)
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const statRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${API_KEY}`);
    if (statRes.ok) {
      const statJson: any = await statRes.json();
      if (statJson.state === "ACTIVE") return { uri, name, mimeType: finalMime };
      if (statJson.state === "FAILED") throw new Error("files-api: file processing FAILED");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("files-api: file not ACTIVE after 90s");
}

export type VideoUnderstandingScene = {
  startSec: number;
  endSec: number;
  description: string;
  rating: number;
  reason: string;
  suggestedKeep: boolean;
};

export async function understandVideo(
  videoUrl: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{
  scenes: VideoUnderstandingScene[];
  totalDuration: number;
  summary: string;
}> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  if (onProgress) await onProgress("מעלה את הוידאו ל-Gemini Files API…");
  const file = await uploadVideoToFilesApi(videoUrl);

  if (onProgress) await onProgress("Gemini מנתח את הוידאו (סצנות + דירוג)…");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: "user",
      parts: [
        { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
        { text: "Analyze this video and return the JSON now." },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
      maxOutputTokens: 3000,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gemini ${res.status}: ${text.slice(0, 400)}`);
  }
  const json: any = await res.json();
  await logUsage({
    model: MODEL,
    operation: "video-analysis",
    inputTokens: json.usageMetadata?.promptTokenCount || 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
    meta: { purpose: "video-understanding" },
  });

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`gemini returned non-JSON: ${cleaned.slice(0, 300)}`);
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  const scenes: VideoUnderstandingScene[] = (Array.isArray(parsed.scenes) ? parsed.scenes : []).map((s: any) => ({
    startSec: Number(s.startSec) || 0,
    endSec: Number(s.endSec) || 0,
    description: String(s.description || ""),
    rating: Math.max(1, Math.min(10, Math.round(Number(s.rating) || 5))),
    reason: String(s.reason || ""),
    suggestedKeep: s.suggestedKeep !== false,
  }));

  return {
    scenes,
    totalDuration: Number(parsed.totalDuration) || (scenes[scenes.length - 1]?.endSec || 0),
    summary: String(parsed.summary || ""),
  };
}
