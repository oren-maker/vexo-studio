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
import { logUsage } from "@/lib/learn/usage-tracker";
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

    // The source clip was generated with the character sheet as the i2v seed,
    // so Sora inherited a 1-2s opening shot of the portrait grid. Remix
    // preserves structure — unless we explicitly tell it not to. Prepend a
    // hard directive so the remix output skips the reference grid entirely.
    const dedupedPrompt = [
      "HARD OVERRIDE: the video must begin immediately with the LIVE-ACTION SCENE. Do NOT show any reference sheet, portrait grid, character lineup, or side-by-side portraits at any point — not the opening frame, not a flash, not a cutaway. Replace any such layout in the source with continuous scene action.",
      body.prompt,
    ].join("\n\n");
    const submitted = await remixSoraVideo({ sourceId: soraId, prompt: dedupedPrompt });

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
      // Mirror to ApiUsage so /admin/wallets + /learn/tokens show remix
      // spend under the unified openai-video engine, same as fresh generations.
      void logUsage({
        model: submitted.model,
        operation: "video-gen",
        videoSeconds: sec,
        sourceId: scene.id,
        meta: {
          engine: "openai-video",
          sceneId: scene.id,
          episodeId: scene.episodeId,
          seasonId: scene.episode?.seasonId,
          title: `Remix scene ${scene.sceneNumber ?? ""}`,
          purpose: "scene-remix",
          jobId: submitted.id,
          sourceAssetId: asset.id,
        },
      }).catch(() => {});
    }
    // Scene activity log entry so the "פעילות" tab captures the remix.
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: scene.id,
        action: "video_remix",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: {
          sourceAssetId: asset.id,
          jobId: submitted.id,
          model: submitted.model,
          seconds: sec,
          estimateUsd: cost,
          promptPreview: body.prompt.slice(0, 300),
        },
      },
    }).catch(() => {});

    return ok({ jobId: submitted.id, model: submitted.model, seconds: sec, estimateUsd: cost, sourceAssetId: asset.id });
  } catch (e) { return handleError(e); }
}
