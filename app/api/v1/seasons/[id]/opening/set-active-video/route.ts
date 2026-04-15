/**
 * POST /api/v1/seasons/[id]/opening/set-active-video
 * Body: { assetId }
 * Promotes a past video generation (from the Asset history) to be the
 * current active videoUrl on the SeasonOpening. Old videos are preserved;
 * this only flips which one is displayed as the active/default.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Body = z.object({ assetId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = Body.parse(await req.json());

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      select: { id: true },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });

    const opening = await prisma.seasonOpening.findUnique({ where: { seasonId: season.id } });
    if (!opening) throw Object.assign(new Error("opening not found"), { statusCode: 404 });

    const asset = await prisma.asset.findFirst({
      where: { id: body.assetId, entityType: "SEASON_OPENING", entityId: opening.id, assetType: "VIDEO" },
    });
    if (!asset) throw Object.assign(new Error("asset not found for this opening"), { statusCode: 404 });

    const updated = await prisma.seasonOpening.update({
      where: { id: opening.id },
      data: { videoUrl: asset.fileUrl, status: "READY" },
    });
    return ok({ opening: updated });
  } catch (e) { return handleError(e); }
}
