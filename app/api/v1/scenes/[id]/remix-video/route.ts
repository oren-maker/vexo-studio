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
            _count: { select: { scenes: true } },
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

    // Sora remix is a DELTA operation — the new prompt should describe
    // ONLY what to change, not redescribe the whole scene. When we stuff
    // the full original context + all the generate-video rules into the
    // remix prompt, Sora treats it as a fresh generation request matching
    // that long description, losing the connection to the source pixels.
    //
    // Learnt 2026-04-17: two remix submissions with long "preserve identity
    // + HARD OVERRIDE + title card + original script + end-frame rules"
    // prompts produced videos with zero visual overlap to the source.
    // The fix is to keep the remix prompt SHORT and change-focused.
    const isFirstScene = scene.sceneNumber === 1;
    const seasonNum = scene.episode?.season?.seasonNumber;
    const epNum = scene.episode?.episodeNumber;

    // User notes are the PRIMARY signal in a remix — everything else is
    // a thin preservation wrapper. We keep a tiny "keep everything else
    // identical" hint so Sora doesn't invent a new scene.
    const preservationHint = "Keep every unchanged element from the source video exactly — same characters, same location, same lighting, same camera angle, same action, same pacing. Apply ONLY the changes below.";

    // If the user's remix notes mention the opening title card, strengthen
    // it concretely. Otherwise stay silent — remix should not inject rules
    // the user didn't ask for.
    const userNotes = body.prompt.trim();
    const wantsTitleCard = isFirstScene && seasonNum != null && epNum != null &&
      /(title card|opening title|season.{0,5}episode|כותרת|כרטיס כותרת)/i.test(userNotes);
    const titleCardDelta = wantsTitleCard
      ? `Insert a 2-second opening title card before the existing action: pure black screen with the text "SEASON ${seasonNum} · EPISODE ${epNum}" in clean white Helvetica Bold sans-serif, centered, 15% safe margins. Fade smoothly to the source action at the 2-second mark. A male narrator says "Season ${seasonNum}, Episode ${epNum}" during the card.`
      : "";

    const dedupedPrompt = [
      preservationHint,
      titleCardDelta,
      `CHANGES REQUESTED BY USER:\n${userNotes}`,
    ].filter(Boolean).join("\n\n").slice(0, 1500);

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
