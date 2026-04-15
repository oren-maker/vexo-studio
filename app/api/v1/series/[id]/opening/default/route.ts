/**
 * GET /api/v1/series/[id]/opening/default
 * Returns the SeasonOpening marked as series default (if any). Used on the
 * series detail page to show the active intro across all seasons.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const series = await prisma.series.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      select: { id: true },
    });
    if (!series) throw Object.assign(new Error("series not found"), { statusCode: 404 });

    const opening = await prisma.seasonOpening.findFirst({
      where: {
        isSeriesDefault: true,
        season: { seriesId: params.id },
      },
      include: { season: { select: { seasonNumber: true, title: true } } },
    });
    return ok({ opening });
  } catch (e) { return handleError(e); }
}
