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
      include: {
        episode: {
          include: {
            season: { include: { series: { include: { project: { select: { id: true, name: true } } } } } },
          },
        },
      },
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

    // Build a full-context remix prompt: the ORIGINAL scene requirements
    // (episode title card, script, cast) + the user's new notes. If we only
    // send the new notes, Sora drops everything not mentioned — including the
    // "SEASON 1 · EPISODE 1" title card, cast identity, and storyline.
    const ep = scene.episode;
    const seasonNum = ep?.season?.seasonNumber;
    const epNum = ep?.episodeNumber;
    const seriesTitle = ep?.season?.series?.title ?? ep?.season?.series?.project?.name ?? "";
    const mem = (scene.memoryContext as { characters?: string[]; soundNotes?: string } | null) ?? {};
    const originalContext = [
      "HARD OVERRIDE: the video must begin immediately with the LIVE-ACTION SCENE. Do NOT show any reference sheet, portrait grid, character lineup, or side-by-side portraits at any point.",
      seasonNum != null && epNum != null
        ? `EPISODE TITLE CARD (MANDATORY — first 1.5 seconds): display large clean white sans-serif text reading "SEASON ${seasonNum} · EPISODE ${epNum}" centered on screen with 15% safe margins, then fade out smoothly before the action starts. A narrator reads "Season ${seasonNum}, Episode ${epNum}" in sync.`
        : null,
      seriesTitle ? `Series: "${seriesTitle}"` : null,
      scene.scriptText ? `Original script (maintain these requirements):\n${scene.scriptText.slice(0, 1200)}` : null,
      mem.characters?.length ? `Characters in scene: ${mem.characters.join(", ")}` : null,
      "END OF CLIP: the final 1.5 seconds MUST fade smoothly to black. Audio ducks to silence.",
    ].filter(Boolean).join("\n\n");

    const dedupedPrompt = [originalContext, "--- REMIX NOTES (apply these changes) ---", body.prompt].join("\n\n");
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
