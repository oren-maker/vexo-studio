/**
 * GET  /api/v1/seasons/[id]/opening → current opening + versions
 * PATCH /api/v1/seasons/[id]/opening → update fields. If prompt changes, snapshot old.
 * DELETE /api/v1/seasons/[id]/opening → remove it
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

async function assertSeason(seasonId: string, orgId: string) {
  const s = await prisma.season.findFirst({
    where: { id: seasonId, series: { project: { organizationId: orgId } } },
    select: { id: true, seriesId: true },
  });
  if (!s) throw Object.assign(new Error("season not found"), { statusCode: 404 });
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertSeason(params.id, ctx.organizationId);
    const opening = await prisma.seasonOpening.findUnique({
      where: { seasonId: params.id },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 30 } },
    });
    return ok({ opening });
  } catch (e) { return handleError(e); }
}

const Patch = z.object({
  prompt: z.string().min(1).optional(),
  duration: z.number().int().min(1).max(20).optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  model: z.enum(["seedance", "kling", "veo3-fast", "veo3-pro"]).optional(),
  isSeriesDefault: z.boolean().optional(),
  includeCharacters: z.boolean().optional(),
  characterIds: z.array(z.string()).optional(),
  styleLabel: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = Patch.parse(await req.json());
    const season = await assertSeason(params.id, ctx.organizationId);

    const existing = await prisma.seasonOpening.findUnique({ where: { seasonId: params.id } });
    if (!existing) throw Object.assign(new Error("opening not found — create one first"), { statusCode: 404 });

    // Snapshot prompt BEFORE overwriting
    if (body.prompt && body.prompt !== existing.currentPrompt) {
      await prisma.seasonOpeningPromptVersion.create({
        data: { openingId: existing.id, prompt: existing.currentPrompt },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (body.prompt !== undefined) updateData.currentPrompt = body.prompt;
    if (body.duration !== undefined) updateData.duration = body.duration;
    if (body.aspectRatio !== undefined) updateData.aspectRatio = body.aspectRatio;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.includeCharacters !== undefined) updateData.includeCharacters = body.includeCharacters;
    if (body.characterIds !== undefined) updateData.characterIds = body.characterIds;
    if (body.styleLabel !== undefined) updateData.styleLabel = body.styleLabel;

    // If user flips this opening to series-default, demote any other opening in the same series.
    if (body.isSeriesDefault === true) {
      const seriesId = season.seriesId;
      await prisma.$transaction([
        prisma.seasonOpening.updateMany({
          where: {
            season: { seriesId },
            NOT: { id: existing.id },
          },
          data: { isSeriesDefault: false },
        }),
        prisma.seasonOpening.update({
          where: { id: existing.id },
          data: { ...updateData, isSeriesDefault: true },
        }),
      ]);
    } else {
      if (body.isSeriesDefault === false) updateData.isSeriesDefault = false;
      await prisma.seasonOpening.update({ where: { id: existing.id }, data: updateData });
    }

    const fresh = await prisma.seasonOpening.findUnique({
      where: { seasonId: params.id },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 30 } },
    });
    return ok({ opening: fresh });
  } catch (e) { return handleError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertSeason(params.id, ctx.organizationId);
    await prisma.seasonOpening.deleteMany({ where: { seasonId: params.id } });
    return ok({ deleted: true });
  } catch (e) { return handleError(e); }
}
