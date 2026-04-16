// Gemini nano-banana (gemini-2.5-flash-image) - image generation from text.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { put } from "@vercel/blob";
import { logUsage } from "./usage-tracker";
import { prisma } from "./db";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash-image";
const TEXT_MODEL = "gemini-3-flash";

// Based on the 6-layer image prompt framework (Subject → Action → Environment → Style → Lighting → Technical).
// Word order matters: earlier layers dominate. Transform an arbitrary video prompt into a structured image prompt.
const IMAGE_PROMPT_SYSTEM = `You convert video-scene descriptions into a single structured IMAGE-generation prompt for nano-banana / DALL-E / similar models.

HARD RULE: word order controls emphasis — put the most critical element FIRST. Write the 6 layers in this exact order, each starting with a bold label:

1. **Subject:** who/what — age, body, clothing materials, specific physical details, expression
2. **Action:** what is happening in this single frame — the decisive moment captured
3. **Environment:** location, weather, background elements, props
4. **Art Style:** visual approach (photorealistic / cinematic 35mm / oil painting / cyberpunk / watercolor / synthwave / minimalism)
5. **Lighting:** direction + time (Golden Hour / Blue Hour / Rembrandt / volumetric / overcast diffused), color temperature
6. **Technical:** lens (85mm portrait bokeh / 50mm / macro / wide angle / drone aerial), depth of field, 4K/8K, film grain, effects

REALISM BOOSTERS when photo/cinematic style:
- Skin: "visible pores, subtle imperfections, natural texture variation"
- Fabric: "realistic folds, detailed weave, visible fibers"
- Metal/glass: "accurate reflections, subsurface depth"

TEXT IN IMAGE: if text is needed — put it inside "quotation marks", specify font, and state exact placement.

Output pure text (no JSON, no markdown fencing), 80–200 words, flowing naturally but keeping the 6 labeled layers. This text goes directly to the image model.`;

async function buildStructuredImagePrompt(videoPrompt: string): Promise<string> {
  if (!API_KEY) return videoPrompt.slice(0, 2000);
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: TEXT_MODEL,
      systemInstruction: IMAGE_PROMPT_SYSTEM,
      generationConfig: { temperature: 0.5, maxOutputTokens: 600 },
    });
    const result = await model.generateContent(
      `Convert this video prompt into a single-frame IMAGE prompt using the 6-layer structure. Choose the single most cinematic beat to capture as a still.\n\n=== VIDEO PROMPT ===\n${videoPrompt.slice(0, 3500)}\n\nReturn only the final image prompt text.`,
    );
    const u = result.response.usageMetadata;
    await logUsage({
      model: TEXT_MODEL,
      operation: "image-prompt-build",
      inputTokens: u?.promptTokenCount || 0,
      outputTokens: u?.candidatesTokenCount || 0,
    });
    return result.response.text().trim();
  } catch {
    return videoPrompt.slice(0, 2000);
  }
}

export type ImageEngine = "nano-banana" | "imagen-4";

export async function generateImageFromPrompt(
  prompt: string,
  sourceId?: string,
  engine: ImageEngine = "nano-banana",
): Promise<{ blobUrl: string; usdCost: number; model: string }> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY חסר");

  const structured = await buildStructuredImagePrompt(prompt);

  // ----- Imagen 4 path (uses :predict, returns predictions[].bytesBase64Encoded) -----
  if (engine === "imagen-4") {
    return generateWithImagen4(structured, sourceId);
  }

  // ----- nano-banana path (uses :generateContent with responseModalities) -----
  // Note: Google docs require BOTH "TEXT" and "IMAGE" in responseModalities.
  // Using IMAGE-only produces finishReason=NO_IMAGE. Include TEXT so the
  // model can reason internally even if its visible output is image-only.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  async function callNanoBanana(promptText: string): Promise<{ imageB64: string | null; mimeType: string; textNote: string | null; finishReason: string | null; safety: any }> {
    const body = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Gemini ${r.status}: ${errText.slice(0, 200)}`);
    }
    const j: any = await r.json();
    const parts = j.candidates?.[0]?.content?.parts || [];
    let imgB64: string | null = null;
    let mime = "image/png";
    let txt: string | null = null;
    for (const p of parts) {
      if (p.inlineData?.data) { imgB64 = p.inlineData.data; mime = p.inlineData.mimeType || "image/png"; }
      else if (p.text) txt = p.text;
    }
    return {
      imageB64: imgB64,
      mimeType: mime,
      textNote: txt,
      finishReason: j.candidates?.[0]?.finishReason ?? null,
      safety: j.promptFeedback?.blockReason || j.candidates?.[0]?.safetyRatings,
    };
  }

  // First try the structured 6-layer prompt. If the model returns NO_IMAGE
  // (which is a known non-safety quirk), retry once with a simpler prompt
  // stripped to just the visual essentials.
  let result: Awaited<ReturnType<typeof callNanoBanana>>;
  try {
    result = await callNanoBanana(structured);
  } catch (e: any) {
    await logUsage({ model: MODEL, operation: "image-gen", sourceId, errored: true, meta: { error: `network: ${String(e.message || e).slice(0, 200)}` } });
    throw e;
  }

  if (!result.imageB64 && result.finishReason === "NO_IMAGE" && !result.safety) {
    // Retry with a simpler, more visual-first prompt — sometimes nano-banana
    // refuses the heavy 6-layer structure but accepts a shorter paraphrase.
    const simpler = structured.replace(/\*\*[^:]+:\*\*\s*/g, "").slice(0, 900);
    try {
      result = await callNanoBanana(`Photograph: ${simpler}. Return one photorealistic image.`);
    } catch {
      /* fall through — will trigger Imagen 4 fallback below */
    }
  }

  if (!result.imageB64) {
    // Final fallback: Imagen 4 (more reliable, same price tier). Only when
    // it's NOT a safety block — safety blocks apply across both models.
    if (!result.safety) {
      try {
        const imagen = await generateWithImagen4(structured, sourceId);
        return imagen;
      } catch (e: any) {
        const reason = `nano-banana: finishReason=${result.finishReason} · imagen-4 fallback failed: ${String(e?.message || e).slice(0, 150)}`;
        await logUsage({ model: MODEL, operation: "image-gen", sourceId, errored: true, meta: { error: reason } });
        throw new Error(`שני המודלים נכשלו — ${reason}`);
      }
    }
    const safety = result.safety;
    const reason = `safety/block: ${typeof safety === "string" ? safety : JSON.stringify(safety).slice(0, 200)}`;
    await logUsage({ model: MODEL, operation: "image-gen", sourceId, errored: true, meta: { error: reason } });
    throw new Error(`Gemini חסם את הפרומפט — ${reason}`);
  }

  const imageB64 = result.imageB64;
  const mimeType = result.mimeType;

  const buffer = Buffer.from(imageB64, "base64");
  const filename = `prompt-images/${sourceId || Date.now()}-${Date.now()}.${mimeType.split("/")[1] || "png"}`;
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
  });

  await logUsage({
    model: MODEL,
    operation: "image-gen",
    inputTokens: Math.round(prompt.length / 4),
    outputTokens: 0,
    imagesOut: 1,
    sourceId,
    meta: { mimeType, byteSize: buffer.length },
  });

  const usdCost = 0.039;

  if (sourceId) {
    await prisma.generatedImage.create({
      data: {
        sourceId,
        blobUrl: blob.url,
        model: MODEL,
        usdCost,
        promptHead: structured.slice(0, 200),
      },
    }).catch(() => {});
  }

  return { blobUrl: blob.url, usdCost, model: MODEL };
}

// ----- Imagen 4 implementation -----
const IMAGEN_MODEL = "imagen-4.0-generate-001";

async function generateWithImagen4(structured: string, sourceId?: string): Promise<{ blobUrl: string; usdCost: number; model: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${API_KEY}`;
  const body = {
    instances: [{ prompt: structured.slice(0, 4000) }],
    parameters: { sampleCount: 1, aspectRatio: "1:1" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    await logUsage({ model: IMAGEN_MODEL, operation: "image-gen", sourceId, errored: true, meta: { status: res.status, error: txt.slice(0, 300) } });
    throw new Error(`Imagen 4 ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    await logUsage({ model: IMAGEN_MODEL, operation: "image-gen", sourceId, errored: true, meta: { error: "no image in response" } });
    throw new Error(`Imagen 4 returned no image — ${JSON.stringify(json).slice(0, 200)}`);
  }
  const buffer = Buffer.from(b64, "base64");
  const filename = `prompt-images/imagen4-${sourceId || Date.now()}-${Date.now()}.png`;
  const blob = await put(filename, buffer, { access: "public", contentType: "image/png" });

  await logUsage({
    model: IMAGEN_MODEL,
    operation: "image-gen",
    inputTokens: Math.round(structured.length / 4),
    outputTokens: 0,
    imagesOut: 1,
    sourceId,
    meta: { byteSize: buffer.length, engine: "imagen-4" },
  });

  const usdCost = 0.04;
  if (sourceId) {
    await prisma.generatedImage.create({
      data: { sourceId, blobUrl: blob.url, model: IMAGEN_MODEL, usdCost, promptHead: structured.slice(0, 200) },
    }).catch(() => {});
  }
  return { blobUrl: blob.url, usdCost, model: IMAGEN_MODEL };
}
