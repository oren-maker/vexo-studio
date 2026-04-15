/**
 * GET /api/v1/episodes/[id]/merge-clips
 * Returns the ordered list of clip URLs to stitch into the merged episode:
 *   1. Series-default opening (if any)
 *   2. Each scene's primary video (Asset with metadata.isPrimary=true), in
 *      sceneNumber order. Scenes with no primary video are listed in `missing`.
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
      select: {
        id: true, episodeNumber: true, title: true,
        season: { select: { id: true, seriesId: true } },
        scenes: { select: { id: true, sceneNumber: true, title: true }, orderBy: { sceneNumber: "asc" } },
      },
    });
    if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });

    // 1. Series-default opening
    const opening = await prisma.seasonOpening.findFirst({
      where: { isSeriesDefault: true, season: { seriesId: ep.season.seriesId }, status: "READY" },
      select: { videoUrl: true, season: { select: { seasonNumber: true } } },
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
    const absolutize = (u: string | null | undefined): string | null => {
      if (!u) return null;
      if (u.startsWith("http://") || u.startsWith("https://")) return u;
      return `${baseUrl}${u}`;
    };

    const clips: { url: string; label: string; kind: "opening" | "scene"; sceneId?: string; sceneNumber?: number }[] = [];
    const openingUrl = absolutize(opening?.videoUrl);
    if (openingUrl) {
      clips.push({ url: openingUrl, label: "פתיח", kind: "opening" });
    }

    // 2. Primary scene videos
    const sceneIds = ep.scenes.map((s) => s.id);
    const missing: { sceneId: string; sceneNumber: number; title: string | null }[] = [];
    if (sceneIds.length > 0) {
      const assets = await prisma.asset.findMany({
        where: { entityType: "SCENE", entityId: { in: sceneIds }, assetType: "VIDEO", status: "READY" },
        select: { id: true, entityId: true, fileUrl: true, metadata: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      // For each scene, pick the asset with metadata.isPrimary=true; fall back to most-recent.
      const bySceneId = new Map<string, typeof assets[number]>();
      for (const a of assets) {
        const meta = (a.metadata as { isPrimary?: boolean } | null) ?? {};
        if (meta.isPrimary && !bySceneId.has(a.entityId)) bySceneId.set(a.entityId, a);
      }
      // Anything without a primary marker → newest
      for (const a of assets) {
        if (!bySceneId.has(a.entityId)) bySceneId.set(a.entityId, a);
      }
      for (const s of ep.scenes) {
        const a = bySceneId.get(s.id);
        const url = absolutize(a?.fileUrl);
        if (url) {
          clips.push({ url, label: `סצנה ${s.sceneNumber}${s.title ? ` · ${s.title}` : ""}`, kind: "scene", sceneId: s.id, sceneNumber: s.sceneNumber });
        } else {
          missing.push({ sceneId: s.id, sceneNumber: s.sceneNumber, title: s.title });
        }
      }
    }

    return ok({
      episodeId: ep.id,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      hasOpening: !!openingUrl,
      clips,
      missing,
      total: clips.length,
    });
  } catch (e) { return handleError(e); }
}
