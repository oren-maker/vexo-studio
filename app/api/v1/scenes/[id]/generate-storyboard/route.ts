import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { CostStrategy, StyleEngine } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const scene = await prisma.scene.findFirst({ where: { id: params.id } });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
    const estimate = await CostStrategy.estimateSceneStoryboardCost(scene.id);
    const projectId = (await prisma.episode.findUnique({ where: { id: scene.episodeId! }, include: { season: { include: { series: true } } } }))!.season.series.projectId;
    const stylePrompt = await StyleEngine.generateStyleConstraints(projectId);
    // Inline "fire" — immediately transition to review (no separate worker on Vercel)
    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "STORYBOARD_REVIEW", styleConstraints: stylePrompt ? { prompt: stylePrompt } : undefined },
    });
    return ok({ jobId: `inline-${Date.now()}`, estimate });
  } catch (e) { return handleError(e); }
}
