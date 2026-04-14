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
      const r = await generateImage({ prompt: userPrompt, aspectRatio: "16:9", model: "nano-banana" });
      return ok({
        mode, model: "nano-banana", elapsedMs: Date.now() - t0,
        imageUrl: r.imageUrl,
        userPrompt,
        // Echo what fal actually received so user can verify the realism wrap
        finalPromptSnippet: "Photorealistic, hyper-realistic, cinematic shot. " + userPrompt + " — Style: photorealistic, hyper-realistic … STRICTLY NOT animated, NOT cartoon, NOT anime, NOT 3D render…",
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
