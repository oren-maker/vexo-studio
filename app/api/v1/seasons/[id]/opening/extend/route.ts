/**
 * POST /api/v1/seasons/[id]/opening/extend
 * Body: { seconds: 4|8|12|16|20, prompt: string }
 *
 * Extends the current READY Sora opening clip with up to 20s of new footage.
 * Sora enforces max 6 extensions per source (~120s total), we enforce the
 * same counter by counting prior extension assets on this opening.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { extendSoraVideo, priceSora, type SoraModel, type SoraSeconds } from "@/lib/providers/openai-sora";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const MAX_EXTENSIONS = 6;

const Body = z.object({
  seconds: z.union([z.literal(4), z.literal(8), z.literal(12), z.literal(16), z.literal(20)]),
  prompt: z.string().min(3).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const body = Body.parse(await req.json());

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: { series: { select: { projectId: true } } },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });

    const opening = await prisma.seasonOpening.findUnique({ where: { seasonId: season.id } });
    if (!opening) throw Object.assign(new Error("no opening — build one first"), { statusCode: 404 });
    if (opening.provider !== "openai") throw Object.assign(new Error("extensions are Sora-only — current opening is " + opening.provider), { statusCode: 400 });
    if (opening.status !== "READY") throw Object.assign(new Error(`opening must be READY to extend (current: ${opening.status})`), { statusCode: 400 });
    if (!opening.falRequestId) throw Object.assign(new Error("opening has no source video id"), { statusCode: 400 });

    // Count extensions already applied to this opening.
    const priorExtensions = await prisma.asset.count({
      where: {
        entityType: "SEASON_OPENING", entityId: opening.id,
        metadata: { path: ["isExtension"], equals: true } as any,
      },
    });
    if (priorExtensions >= MAX_EXTENSIONS) {
      throw Object.assign(new Error(`reached max ${MAX_EXTENSIONS} extensions — Sora caps total length at ~120s`), { statusCode: 400 });
    }

    const sec = String(body.seconds) as SoraSeconds;
    const submitted = await extendSoraVideo({
      sourceId: opening.falRequestId,
      prompt: body.prompt,
      seconds: sec,
    });

    // Swap in the new video id and flip to GENERATING — GET polling will flip to READY.
    await prisma.seasonOpening.update({
      where: { id: opening.id },
      data: { falRequestId: submitted.id, status: "GENERATING" },
    });

    const cost = priceSora(submitted.model as SoraModel, body.seconds);
    await chargeUsd({
      organizationId: ctx.organizationId,
      projectId: season.series.projectId,
      entityType: "SEASON_OPENING", entityId: opening.id,
      providerName: "OpenAI", category: "GENERATION",
      description: `Opening extension #${priorExtensions + 1} · ${submitted.model} · ${body.seconds}s`,
      unitCost: cost, quantity: 1, userId: ctx.user.id,
      meta: { seasonId: season.id, openingId: opening.id, model: submitted.model, durationSeconds: body.seconds, isExtension: true, extensionIndex: priorExtensions + 1, parentVideoId: opening.falRequestId },
    }).catch(() => {});

    return ok({
      jobId: submitted.id,
      seconds: body.seconds,
      estimateUsd: cost,
      extensionIndex: priorExtensions + 1,
      extensionsRemaining: MAX_EXTENSIONS - (priorExtensions + 1),
    });
  } catch (e) { return handleError(e); }
}
