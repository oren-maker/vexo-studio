/**
 * GET /api/v1/seasons/[id]/opening/context
 * Returns the first 3 scenes of the season's first episode plus a one-line
 * narrative connection — used inside the OpeningWizard so the user sees the
 * plot context the AI is authoring an opening teaser for.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_project"); if (f) return f;

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: {
        series: { select: { title: true } },
        episodes: {
          orderBy: { episodeNumber: "asc" },
          take: 1,
          include: {
            scenes: {
              orderBy: { sceneNumber: "asc" },
              take: 3,
              select: { sceneNumber: true, summary: true, scriptText: true, memoryContext: true },
            },
          },
        },
      },
    });
    if (!season) return ok({ scenes: [], connection: null });

    const ep = season.episodes[0];
    if (!ep) return ok({ scenes: [], connection: null });

    const scenes = ep.scenes.map((s) => ({
      number: s.sceneNumber,
      summary: s.summary ?? "",
      excerpt: (s.scriptText ?? "").slice(0, 220),
      bridge: ((s.memoryContext as { narrativeBridge?: string } | null)?.narrativeBridge) ?? null,
    }));

    // Use the brain-authored bridge of SC3 (which already explains how SC2 escalates into SC3)
    // as the connection sentence; falls back to SC2's bridge if SC3 has none.
    const connection = scenes.find((s) => s.number === 3)?.bridge
      ?? scenes.find((s) => s.number === 2)?.bridge
      ?? null;

    return ok({ seriesTitle: season.series.title, scenes, connection });
  } catch (e) { return handleError(e); }
}
