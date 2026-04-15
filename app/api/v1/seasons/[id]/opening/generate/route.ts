/**
 * POST /api/v1/seasons/[id]/opening/generate
 * Submits the current opening prompt to fal. Webhook at
 * /api/v1/webhooks/incoming/fal?openingId=... flips status to READY.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { submitVideo, type VideoModel, priceVideo, generateImage, priceImage } from "@/lib/providers/fal";
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

    // Pull character reference portraits. fal video models (VEO 3, SeeDance,
    // Kling) IGNORE image_urls for identity — they only respect a single
    // starting image (i2v mode). So we first build an ENSEMBLE FRAME with
    // nano-banana (which really does accept multi-reference composites), then
    // use that frame as the i2v seed. The video model extrapolates from real
    // faces instead of inventing new ones.
    const charRefs = opening.includeCharacters && opening.characterIds.length > 0
      ? await prisma.character.findMany({
          where: { projectId: season.series.projectId, id: { in: opening.characterIds } },
          include: { media: { orderBy: { createdAt: "asc" } } },
        })
      : [];
    const referenceImageUrls = charRefs.map((c) => {
      const front = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? c.media[0];
      return front?.fileUrl;
    }).filter((u): u is string => !!u);

    await prisma.seasonOpening.update({ where: { id: opening.id }, data: { status: "GENERATING" } });

    // Build ensemble seed frame — only if we have real portraits
    let seedImageUrl: string | undefined;
    if (referenceImageUrls.length > 0 && charRefs.length > 0) {
      try {
        const namesList = charRefs.map((c) => c.name).join(", ");
        const appearanceList = charRefs
          .map((c) => `${c.name}: ${(c.appearance ?? "").slice(0, 100)}`)
          .join(" | ");
        const ensemblePrompt = `Wide cinematic ensemble group portrait for a TV title sequence. All ${charRefs.length} characters arranged in a staggered composition, each face fully visible, shoulders-up: ${namesList}. Match exactly the reference portraits provided — do not invent new faces. ${appearanceList}. Dramatic moody key light, shallow depth of field, 16:9 widescreen, photorealistic editorial photography, grade matching the show's genre.`;
        const seed = await generateImage({
          prompt: ensemblePrompt,
          aspectRatio: "16:9",
          model: "nano-banana",
          referenceImageUrls: referenceImageUrls.slice(0, 3),
        });
        seedImageUrl = seed.imageUrl;

        // Persist + charge the ensemble image
        await prisma.asset.create({
          data: {
            projectId: season.series.projectId,
            entityType: "SEASON_OPENING", entityId: opening.id, assetType: "IMAGE",
            fileUrl: seedImageUrl, mimeType: "image/jpeg", status: "READY",
            metadata: { provider: "fal", model: "nano-banana", role: "i2v-seed", charNames: charRefs.map((c) => c.name) } as object,
          },
        }).catch(() => {});
        await chargeUsd({
          organizationId: ctx.organizationId,
          projectId: season.series.projectId,
          entityType: "SEASON_OPENING",
          entityId: season.id,
          providerName: "fal.ai",
          category: "GENERATION",
          description: `Opening · ensemble seed · nano-banana`,
          unitCost: priceImage("nano-banana"), quantity: 1,
          userId: ctx.user.id,
          meta: { seasonId: season.id, openingId: opening.id, role: "i2v-seed" },
        }).catch(() => {});
      } catch (e) {
        console.warn(`[opening-seed-image] ${(e as Error).message} — falling back to t2v`);
        // keep seedImageUrl undefined → falls back to t2v without identity lock
      }
    }

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
        imageUrl: seedImageUrl,                    // ← ensemble frame as i2v seed
        referenceImageUrls: referenceImageUrls.slice(0, 3),
      });
    } catch (e) {
      await prisma.seasonOpening.update({ where: { id: opening.id }, data: { status: "DRAFT" } }).catch(() => {});
      throw Object.assign(new Error(`fal submit failed: ${(e as Error).message}`), { statusCode: 502 });
    }

    await prisma.seasonOpening.update({
      where: { id: opening.id },
      data: { falRequestId: submitted.requestId },
    });

    // Charge the estimated cost upfront; webhook will reconcile on completion.
    const estUsd = priceVideo(opening.model as VideoModel, opening.duration);
    await chargeUsd({
      organizationId: ctx.organizationId,
      projectId: season.series.projectId,
      entityType: "SEASON_OPENING",
      entityId: season.id,
      providerName: "fal.ai",
      category: "GENERATION",
      description: `Opening · ${opening.model} · ${opening.duration}s`,
      unitCost: estUsd,
      quantity: 1,
      userId: ctx.user.id,
      meta: { seasonId: season.id, openingId: opening.id, model: opening.model, durationSeconds: opening.duration },
    }).catch(() => {});

    return ok({
      openingId: opening.id,
      jobId: submitted.requestId,
      statusUrl: submitted.statusUrl,
      model: submitted.model,
      estimateUsd: estUsd,
    });
  } catch (e) { return handleError(e); }
}
