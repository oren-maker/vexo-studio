import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { CostStrategy, StyleEngine } from "@/lib/services";
import { generateImage } from "@/lib/providers/fal";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  imageModel: z.enum(["nano-banana"]).default("nano-banana"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const scene = await prisma.scene.findFirst({
      where: { id: params.id },
      include: { frames: { orderBy: { orderIndex: "asc" } } },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
    if (!scene.episodeId) throw Object.assign(new Error("scene has no episode"), { statusCode: 400 });

    const ep = await prisma.episode.findUniqueOrThrow({
      where: { id: scene.episodeId },
      include: { season: { include: { series: true } } },
    });
    const projectId = ep.season.series.projectId;
    const stylePrompt = await StyleEngine.generateStyleConstraints(projectId);
    const estimate = await CostStrategy.estimateSceneStoryboardCost(scene.id);

    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "STORYBOARD_GENERATING", styleConstraints: stylePrompt ? { prompt: stylePrompt } : undefined },
    });

    const generated: Array<{ frameId: string; imageUrl: string | null; error?: string }> = [];
    const frames = scene.frames.length > 0 ? scene.frames : [];

    if (frames.length > 0 && process.env.FAL_API_KEY) {
      // Limit parallelism to avoid rate limits + serverless timeout
      for (const frame of frames) {
        try {
          const prompt = [frame.imagePrompt, stylePrompt && `Style: ${stylePrompt}`].filter(Boolean).join("\n\n");
          if (!prompt) { generated.push({ frameId: frame.id, imageUrl: null, error: "no prompt" }); continue; }
          const r = await generateImage({ prompt, negativePrompt: frame.negativePrompt ?? undefined, aspectRatio: body.aspectRatio, model: body.imageModel });
          await prisma.sceneFrame.update({ where: { id: frame.id }, data: { generatedImageUrl: r.imageUrl, status: "READY" } });
          await prisma.asset.create({
            data: { projectId, entityType: "FRAME", entityId: frame.id, assetType: "IMAGE", fileUrl: r.imageUrl, mimeType: "image/jpeg", status: "READY", metadata: { provider: "fal", model: body.imageModel ?? "nano-banana" } },
          });
          generated.push({ frameId: frame.id, imageUrl: r.imageUrl });
        } catch (e) {
          generated.push({ frameId: frame.id, imageUrl: null, error: (e as Error).message });
        }
      }
    }

    await prisma.scene.update({ where: { id: scene.id }, data: { status: "STORYBOARD_REVIEW" } });
    return ok({ jobId: `inline-${Date.now()}`, estimate, framesGenerated: generated.filter((g) => g.imageUrl).length, framesTotal: frames.length, model: body.imageModel ?? "nano-banana", details: generated });
  } catch (e) { return handleError(e); }
}
