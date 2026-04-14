/**
 * Realism test endpoint. Generates a sample image OR video using the user-approved
 * photorealism prompt template, and returns the URL + the EXACT prompt sent to fal
 * so you can verify the suffix/prefix wrapping.
 */
import { NextRequest } from "next/server";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { generateImage, submitVideo } from "@/lib/providers/fal";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    if (!process.env.FAL_API_KEY) throw Object.assign(new Error("FAL_API_KEY not set"), { statusCode: 500 });

    const body = await req.json().catch(() => ({}));
    const mode: "image" | "video" = body.mode === "video" ? "video" : "image";
    const userPrompt: string = (body.prompt as string) || "A young woman with dark hair, wearing a navy blazer, standing in a busy newsroom looking concerned at her phone, soft afternoon light streaming through tall windows.";

    if (mode === "image") {
      const t0 = Date.now();
      // Reconstruct the exact prompt that generateImage will send so we can echo it back
      const sanitized = userPrompt
        .replace(/\b(holographic|hologram|neon[- ]lit|digital[- ]art|rendered|cinematic lighting|dramatic lighting|glowing edges?|sci[- ]?fi|cyberpunk|vaporwave|dreamlike|surreal)\b/gi, "")
        .replace(/\s{2,}/g, " ").trim();
      const PREFIX = "REAL PHOTOGRAPH taken by a professional photographer on a Sony A7 IV camera, NOT a digital painting, NOT a 3D render, NOT AI art. Photojournalism documentary style, candid unposed moment. ";
      const SUFFIX = " — Style: photorealistic, hyper-realistic. Technical: 8k resolution, highly detailed, sharp focus, shot on 35mm lens, shallow depth of field. Lighting: natural lighting, soft shadows. Real human skin with visible pores, real eyes with caught light, real hair strands, accurate physical shadows, subtle film grain. This is a REAL PHOTOGRAPH of REAL PEOPLE. STRICTLY NOT animated, NOT cartoon, NOT anime, NOT 3D render, NOT illustration, NOT painted, NOT digital art, NOT stylized, NOT holographic, NOT neon-lit.";
      const finalPrompt = PREFIX + sanitized + SUFFIX;

      const r = await generateImage({ prompt: userPrompt, aspectRatio: "16:9", model: "nano-banana" });
      return ok({
        mode, model: "nano-banana", elapsedMs: Date.now() - t0,
        imageUrl: r.imageUrl,
        userPrompt,
        sanitizedPrompt: sanitized,
        finalPrompt,
        removed: userPrompt === sanitized ? [] : userPrompt.match(/\b(holographic|hologram|neon[- ]lit|digital[- ]art|rendered|cinematic lighting|dramatic lighting|glowing edges?|sci[- ]?fi|cyberpunk|vaporwave|dreamlike|surreal)\b/gi) ?? [],
      });
    }

    // Video mode: submit and return the request id (poll on the scene/asset table later if needed)
    const t0 = Date.now();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
    const submitted = await submitVideo({
      prompt: userPrompt,
      model: (body.videoModel as "veo3-fast" | "veo3-pro" | "seedance" | "kling") ?? "veo3-fast",
      durationSeconds: Number(body.duration ?? 5),
      aspectRatio: "16:9",
      // No webhook here — caller polls /api/v1/admin/test-realism/status?requestId=...
    });
    return ok({
      mode, elapsedMs: Date.now() - t0,
      requestId: submitted.requestId,
      statusUrl: submitted.statusUrl,
      resultUrl: submitted.resultUrl,
      model: submitted.model,
      userPrompt,
      finalPromptSnippet: "Photorealistic, hyper-realistic, cinematic shot. Live-action film footage. " + userPrompt + " — Style: photorealistic … STRICTLY NOT animated, NOT cartoon …",
    });
  } catch (e) { return handleError(e); }
}
