/**
 * POST /api/v1/seasons/[id]/opening/generate
 * Submits the current opening prompt to fal. Webhook at
 * /api/v1/webhooks/incoming/fal?openingId=... flips status to READY.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { submitVideo, type VideoModel, priceVideo } from "@/lib/providers/fal";
import { submitVeoVideo, type GoogleVeoModel, priceVeoVideo } from "@/lib/providers/google-veo";
import { submitSoraVideo, type SoraModel, type SoraSeconds, priceSora } from "@/lib/providers/openai-sora";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    if (!process.env.FAL_API_KEY) throw Object.assign(new Error("FAL_API_KEY not set"), { statusCode: 500 });

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: { series: { include: { project: true } } },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });

    const opening = await prisma.seasonOpening.findUnique({ where: { seasonId: season.id } });
    if (!opening) throw Object.assign(new Error("no opening — build a prompt first"), { statusCode: 400 });
    if (!opening.currentPrompt) throw Object.assign(new Error("opening has no prompt"), { statusCode: 400 });

    // Use an EXISTING character portrait as the i2v seed — no extra image
    // generation. fal video models (VEO 3 / SeeDance / Kling) only take one
    // image_url for i2v identity lock, so we pick the first cast character's
    // front-angle portrait. The other characters are described in the prompt.
    const charRefs = opening.includeCharacters && opening.characterIds.length > 0
      ? await prisma.character.findMany({
          where: { projectId: season.series.projectId, id: { in: opening.characterIds } },
          include: { media: { orderBy: { createdAt: "asc" } } },
        })
      : [];
    // Track whether each reference is an 8-panel sheet so Sora can auto-crop
    // it to a single portrait (see openai-sora.ts::submitSoraVideo imageIsSheet).
    const seedPicks = charRefs.map((c) => {
      const front = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? c.media[0];
      const angle = (front?.metadata as { angle?: string } | null)?.angle;
      return front?.fileUrl ? { url: front.fileUrl, isSheet: angle === "sheet" } : null;
    }).filter((x): x is { url: string; isSheet: boolean } => !!x);
    const referenceImageUrls = seedPicks.map((s) => s.url);

    // Pick the first cast portrait as the seed. Preserves character identity
    // without spending extra on a generated composite.
    const seedImageUrl: string | undefined = seedPicks[0]?.url;
    const seedIsSheet: boolean = !!seedPicks[0]?.isSheet;

    await prisma.seasonOpening.update({ where: { id: opening.id }, data: { status: "GENERATING" } });

    const isGoogleVeo = opening.model.startsWith("google-veo-");
    const isSora = opening.model === "sora-2" || opening.model === "sora-2-pro";
    let submittedId: string;
    let submittedDisplay: string;
    let estUsd: number;

    if (isSora) {
      // Sora chain-extend: durations > 20 are served via multiple sequential
      // 20s clips (initial + extensions). Build the per-chunk prompts up-front
      // so the polling loop can fire each one as the previous finishes.
      const totalSec = Math.min(opening.duration, 120);
      const chunkCount = totalSec > 20 ? Math.ceil(totalSec / 20) : 1;
      let chunkPrompts: string[] = [opening.currentPrompt];
      if (chunkCount > 1) {
        const { splitPromptIntoChunks } = await import("@/lib/providers/sora-chunk-splitter");
        chunkPrompts = await splitPromptIntoChunks({
          masterPrompt: opening.currentPrompt,
          totalSeconds: totalSec,
          seriesTitle: season.series.title ?? season.series.project.name,
        });
      }

      // Snap first chunk to exactly 20s (or smaller if single-chunk and user picked <20).
      const firstSec: SoraSeconds = chunkCount > 1
        ? "20"
        : (opening.duration >= 20 ? "20"
          : opening.duration >= 16 ? "16"
          : opening.duration >= 12 ? "12"
          : opening.duration >= 8 ? "8"
          : "4");
      const size = opening.aspectRatio === "9:16" ? "720x1280" : "1280x720";
      try {
        const submitted = await submitSoraVideo({
          prompt: chunkPrompts[0],
          model: opening.model as SoraModel,
          seconds: firstSec,
          size,
          imageUrl: seedImageUrl,
          imageIsSheet: seedIsSheet,
        });
        submittedId = submitted.id;
        submittedDisplay = opening.model;
      } catch (e) {
        await prisma.seasonOpening.update({ where: { id: opening.id }, data: { status: "DRAFT" } }).catch(() => {});
        throw Object.assign(new Error(`Sora submit failed: ${(e as Error).message}`), { statusCode: 502 });
      }
      estUsd = priceSora(opening.model as SoraModel, parseInt(firstSec, 10));
      await prisma.seasonOpening.update({
        where: { id: opening.id },
        data: {
          falRequestId: submittedId,
          provider: "openai",
          chunkPrompts: chunkPrompts as any,
          chunkIndex: 0,
          chunkVideoIds: [submittedId] as any,
        },
      });
      await chargeUsd({
        organizationId: ctx.organizationId,
        projectId: season.series.projectId,
        entityType: "SEASON_OPENING",
        entityId: season.id,
        providerName: "OpenAI",
        category: "GENERATION",
        description: `Opening · chunk 1/${chunkCount} · ${opening.model} · ${firstSec}s`,
        unitCost: estUsd, quantity: 1,
        userId: ctx.user.id,
        meta: { seasonId: season.id, openingId: opening.id, model: opening.model, durationSeconds: parseInt(firstSec, 10), provider: "openai", chunkIndex: 0, totalChunks: chunkCount },
      }).catch(() => {});
    } else if (isGoogleVeo) {
      // Google VEO direct — supports referenceImages on 3.1 for up to 3 subjects
      const veoModel = opening.model.replace(/^google-/, "") as GoogleVeoModel;
      try {
        const submitted = await submitVeoVideo({
          prompt: opening.currentPrompt.slice(0, 1000),
          model: veoModel,
          durationSeconds: opening.duration,
          aspectRatio: opening.aspectRatio as "16:9" | "9:16" | "1:1",
          imageUrl: seedImageUrl,
          referenceImageUrls: referenceImageUrls.slice(0, 3),
        });
        submittedId = submitted.operationName;
        submittedDisplay = veoModel;
      } catch (e) {
        await prisma.seasonOpening.update({ where: { id: opening.id }, data: { status: "DRAFT" } }).catch(() => {});
        throw Object.assign(new Error(`Google VEO submit failed: ${(e as Error).message}`), { statusCode: 502 });
      }
      estUsd = priceVeoVideo(veoModel, opening.duration);
      await prisma.seasonOpening.update({
        where: { id: opening.id },
        data: { falRequestId: submittedId, provider: "google" },
      });
      await chargeUsd({
        organizationId: ctx.organizationId,
        projectId: season.series.projectId,
        entityType: "SEASON_OPENING",
        entityId: season.id,
        providerName: "Google Gemini",
        category: "GENERATION",
        description: `Opening · ${veoModel} · ${opening.duration}s (Google direct)`,
        unitCost: estUsd, quantity: 1,
        userId: ctx.user.id,
        meta: { seasonId: season.id, openingId: opening.id, model: veoModel, durationSeconds: opening.duration, provider: "google" },
      }).catch(() => {});
    } else {
      // fal path (existing behaviour)
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
      const webhookUrl = `${baseUrl}/api/v1/webhooks/incoming/fal?openingId=${opening.id}&duration=${opening.duration}&model=${opening.model}`;

      let submitted;
      try {
        submitted = await submitVideo({
          prompt: opening.currentPrompt,
          model: opening.model as VideoModel,
          durationSeconds: opening.duration,
          aspectRatio: opening.aspectRatio as "16:9" | "9:16" | "1:1",
          webhookUrl,
          imageUrl: seedImageUrl,
          // Vidu Q1 accepts up to 7 reference subjects; other models cap at 3.
          referenceImageUrls: opening.model === "vidu-q1" ? referenceImageUrls.slice(0, 7) : referenceImageUrls.slice(0, 3),
        });
      } catch (e) {
        await prisma.seasonOpening.update({ where: { id: opening.id }, data: { status: "DRAFT" } }).catch(() => {});
        throw Object.assign(new Error(`fal submit failed: ${(e as Error).message}`), { statusCode: 502 });
      }
      submittedId = submitted.requestId;
      submittedDisplay = submitted.model;
      estUsd = priceVideo(opening.model as VideoModel, opening.duration);
      await prisma.seasonOpening.update({
        where: { id: opening.id },
        data: { falRequestId: submittedId, provider: "fal" },
      });
      await chargeUsd({
        organizationId: ctx.organizationId,
        projectId: season.series.projectId,
        entityType: "SEASON_OPENING",
        entityId: season.id,
        providerName: "fal.ai",
        category: "GENERATION",
        description: `Opening · ${opening.model} · ${opening.duration}s`,
        unitCost: estUsd, quantity: 1,
        userId: ctx.user.id,
        meta: { seasonId: season.id, openingId: opening.id, model: opening.model, durationSeconds: opening.duration },
      }).catch(() => {});
    }

    return ok({
      openingId: opening.id,
      jobId: submittedId,
      model: submittedDisplay,
      provider: isSora ? "openai" : isGoogleVeo ? "google" : "fal",
      estimateUsd: estUsd,
    });
  } catch (e) { return handleError(e); }
}
