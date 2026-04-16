/**
 * POST /api/v1/scenes/[id]/remix-video
 * Body: { assetId, prompt }
 *
 * Takes an existing Sora-generated scene video Asset, calls OpenAI's
 * `/v1/videos/{id}/remix`, and records the new pending job on the scene.
 * The scene's GET handler will pick it up and store the resulting MP4 as a
 * fresh Asset row when it lands. Identity / look / motion are preserved
 * automatically — only the prompt-described change is applied.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { remixSoraVideo, priceSora, type SoraModel } from "@/lib/providers/openai-sora";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;

// Sora's /remix endpoint accepts up to 2000 chars. We intentionally accept
// any length here (up to 8000) so the UI isn't hostile to long director
// notes, then auto-trim before the Sora call.
const Body = z.object({
  assetId: z.string().min(1),
  prompt: z.string().min(3).max(8000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const body = Body.parse(await req.json());

    const scene = await prisma.scene.findFirst({
      where: {
        id: params.id, OR: [
          { episode: { season: { series: { project: { organizationId: ctx.organizationId } } } } },
          { lesson: { module: { course: { project: { organizationId: ctx.organizationId } } } } },
        ],
      },
      include: { episode: { include: { season: { include: { series: { select: { projectId: true } } } } } } },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });

    const asset = await prisma.asset.findFirst({
      where: { id: body.assetId, entityType: "SCENE", entityId: scene.id, assetType: "VIDEO" },
      select: { id: true, metadata: true, fileUrl: true },
    });
    if (!asset) throw Object.assign(new Error("video not found on this scene"), { statusCode: 404 });

    // Sora video id was stored as the Asset's `videoUri`-equivalent — for
    // Sora-generated assets we used proxy URL `…/sora-proxy?id=video_…`.
    // Extract the id from there or from metadata.
    const meta = (asset.metadata as { provider?: string; soraVideoId?: string; model?: string } | null) ?? {};
    let soraId = meta.soraVideoId;
    if (!soraId) {
      const m = asset.fileUrl.match(/[?&]id=(video_[^&]+)/);
      if (m) soraId = m[1];
    }
    if (!soraId) throw Object.assign(new Error("this video is not a Sora-generated asset (no source id)"), { statusCode: 400 });

    const submitted = await remixSoraVideo({ sourceId: soraId, prompt: body.prompt });

    // Track pending — same shape generate-video uses.
    const existingMem = (scene.memoryContext as Record<string, unknown> | null) ?? {};
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        memoryContext: {
          ...existingMem,
          pendingVideoJob: {
            provider: "openai",
            jobId: submitted.id,
            model: submitted.model,
            durationSeconds: parseInt(submitted.seconds, 10),
            submittedAt: new Date().toISOString(),
            kind: "remix",
            sourceAssetId: asset.id,
          },
        } as object,
      },
    });

    const sec = parseInt(submitted.seconds, 10);
    const cost = priceSora(submitted.model as SoraModel, sec);
    const projectId = scene.episode?.season.series.projectId;
    if (projectId) {
      await chargeUsd({
        organizationId: ctx.organizationId, projectId,
        entityType: "SCENE", entityId: scene.id,
        providerName: "OpenAI", category: "GENERATION",
        description: `Sora remix · ${submitted.model} · ${sec}s`,
        unitCost: cost, quantity: 1, userId: ctx.user.id,
      }).catch(() => {});
    }

    return ok({ jobId: submitted.id, model: submitted.model, seconds: sec, estimateUsd: cost, sourceAssetId: asset.id });
  } catch (e) { return handleError(e); }
}
