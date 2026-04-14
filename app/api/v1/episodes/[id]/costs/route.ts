/**
 * Aggregate all CostEntry rows that belong to this episode, broken down by
 * category: episode-level, scene-level, frame-level, and character-media-level
 * (for characters linked to the episode).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;

    const ep = await prisma.episode.findFirst({
      where: { id: params.id, season: { series: { project: { organizationId: ctx.organizationId } } } },
      include: {
        scenes: { include: { frames: true } },
        characters: { include: { character: { include: { media: true } } } },
      },
    });
    if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });

    const sceneIds = ep.scenes.map((s) => s.id);
    const frameIds = ep.scenes.flatMap((s) => s.frames.map((f) => f.id));
    const charMediaIds = ep.characters.flatMap((ec) => ec.character.media.map((m) => m.id));

    const [epEntries, sceneEntries, frameEntries, mediaEntries] = await Promise.all([
      prisma.costEntry.findMany({ where: { entityType: "EPISODE", entityId: ep.id }, orderBy: { createdAt: "desc" } }),
      sceneIds.length
        ? prisma.costEntry.findMany({ where: { entityType: "SCENE", entityId: { in: sceneIds } }, orderBy: { createdAt: "desc" } })
        : Promise.resolve([]),
      frameIds.length
        ? prisma.costEntry.findMany({ where: { entityType: "FRAME", entityId: { in: frameIds } }, orderBy: { createdAt: "desc" } })
        : Promise.resolve([]),
      charMediaIds.length
        ? prisma.costEntry.findMany({ where: { entityType: "CHARACTER_MEDIA", entityId: { in: charMediaIds } }, orderBy: { createdAt: "desc" } })
        : Promise.resolve([]),
    ]);

    const sum = (arr: { totalCost: number }[]) => arr.reduce((s, e) => s + e.totalCost, 0);
    const epTotal = sum(epEntries);
    const sceneTotal = sum(sceneEntries);
    const frameTotal = sum(frameEntries);
    const mediaTotal = sum(mediaEntries);
    const total = epTotal + sceneTotal + frameTotal + mediaTotal;

    const byCategory = [...epEntries, ...sceneEntries, ...frameEntries, ...mediaEntries].reduce<Record<string, number>>((acc, e) => {
      acc[e.costCategory] = (acc[e.costCategory] ?? 0) + e.totalCost;
      return acc;
    }, {});

    return ok({
      episodeId: ep.id,
      episodeNumber: ep.episodeNumber,
      total: +total.toFixed(4),
      breakdown: {
        episode: +epTotal.toFixed(4),
        scenes: +sceneTotal.toFixed(4),
        frames: +frameTotal.toFixed(4),
        characterMedia: +mediaTotal.toFixed(4),
      },
      byCategory,
      entries: [
        ...epEntries.map((e) => ({ ...e, scope: "episode" })),
        ...sceneEntries.map((e) => ({ ...e, scope: "scene" })),
        ...frameEntries.map((e) => ({ ...e, scope: "frame" })),
        ...mediaEntries.map((e) => ({ ...e, scope: "characterMedia" })),
      ].slice(0, 200),
    });
  } catch (e) { return handleError(e); }
}
