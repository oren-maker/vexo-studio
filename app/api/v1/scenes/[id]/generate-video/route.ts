import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { CostStrategy } from "@/lib/services";
import { submitVideo, type VideoModel } from "@/lib/providers/fal";
import { fetchReferencePrompts, buildReferenceContext } from "@/lib/providers/vexo-learn";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  videoModel: z.enum(["seedance", "kling", "veo3-pro", "veo3-fast"]).default("veo3-fast"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  durationSeconds: z.number().int().min(1).max(10).optional(),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const scene = await prisma.scene.findFirst({ where: { id: params.id } });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
    // Allow STORYBOARD_REVIEW too — auto-approve workflow
    if (!["STORYBOARD_APPROVED", "STORYBOARD_REVIEW", "VIDEO_REVIEW"].includes(scene.status)) {
      throw Object.assign(new Error(`storyboard status is ${scene.status}, expected STORYBOARD_APPROVED`), { statusCode: 409 });
    }

    const estimate = await CostStrategy.estimateSceneVideoCost(scene.id);
    await prisma.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_GENERATING" } });

    if (!process.env.FAL_API_KEY) {
      // Fallback: skip generation, mark for review
      await prisma.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_REVIEW" } });
      return ok({ jobId: `stub-${Date.now()}`, estimate, note: "FAL_API_KEY not set; status flipped without generation." });
    }

    const basePrompt = [
      scene.title && `Title: ${scene.title}`,
      scene.summary && `Summary: ${scene.summary}`,
      scene.scriptText && `Script:\n${scene.scriptText}`,
      "Cinematic, high quality, 24fps.",
    ].filter(Boolean).join("\n\n");

    // Pull Seedance reference prompts to guide tone/level of detail
    const refQuery = [scene.title, scene.summary].filter(Boolean).join(" ");
    const refs = await fetchReferencePrompts(refQuery, 3);
    const referenceCtx = buildReferenceContext(refs);
    const prompt = referenceCtx ? `${basePrompt}${referenceCtx}` : basePrompt;

    // Build webhook URL pointing back at us
    const duration = body.durationSeconds ?? 5;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
    const webhookUrl = `${baseUrl}/api/v1/webhooks/incoming/fal?sceneId=${scene.id}&duration=${duration}&model=${body.videoModel ?? "veo3-fast"}`;

    const submitted = await submitVideo({
      prompt,
      model: body.videoModel as VideoModel,
      durationSeconds: duration,
      aspectRatio: body.aspectRatio,
      webhookUrl,
    });

    // Track in scene memoryContext for status polling
    const projectId = (await prisma.episode.findUniqueOrThrow({ where: { id: scene.episodeId! }, include: { season: { include: { series: true } } } })).season.series.projectId;
    await prisma.lipSyncJob.create({
      data: {
        entityType: "SCENE", entityId: scene.id, sceneId: scene.id,
        status: "PENDING",
      },
    }).catch(() => {});

    return ok({ jobId: submitted.requestId, estimate, model: submitted.model, statusUrl: submitted.statusUrl, framework: "fal-queue", projectId });
  } catch (e) { return handleError(e); }
}
