/**
 * Full project activity log — merges AuditLog (who edited what) with AILog
 * (AI Director actions) and surfaces the asset/cost creations we care about.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

type Row = {
  id: string;
  at: string;
  kind: string;       // high-level category (scene-edit / frame-generated / video-created / ...)
  actor: string | null;
  title: string;      // human summary
  detail?: string;    // extra detail
  entityType: string;
  entityId: string;
  meta?: unknown;
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500);

    // Get IDs of every scene/frame/episode/character in this project so we can
    // filter AuditLog rows (which are keyed by entityType+entityId not projectId)
    const [scenes, frames, episodes, characters, characterMedia, assets] = await Promise.all([
      prisma.scene.findMany({ where: { episode: { season: { series: { projectId: params.id } } } }, select: { id: true, sceneNumber: true, title: true, episodeId: true } }),
      prisma.sceneFrame.findMany({ where: { scene: { episode: { season: { series: { projectId: params.id } } } } }, select: { id: true, orderIndex: true, sceneId: true } }),
      prisma.episode.findMany({ where: { season: { series: { projectId: params.id } } }, select: { id: true, episodeNumber: true, title: true } }),
      prisma.character.findMany({ where: { projectId: params.id }, select: { id: true, name: true } }),
      prisma.characterMedia.findMany({ where: { character: { projectId: params.id } }, select: { id: true, characterId: true, mediaType: true, metadata: true, createdAt: true } }),
      prisma.asset.findMany({ where: { projectId: params.id }, select: { id: true, entityType: true, entityId: true, assetType: true, createdAt: true, metadata: true } }),
    ]);

    const entityIds = [
      ...scenes.map((s) => s.id),
      ...frames.map((f) => f.id),
      ...episodes.map((e) => e.id),
      ...characters.map((c) => c.id),
      ...characterMedia.map((m) => m.id),
    ];

    const [audits, ai] = await Promise.all([
      entityIds.length > 0
        ? prisma.auditLog.findMany({
            where: { organizationId: ctx.organizationId, entityId: { in: entityIds } },
            orderBy: { createdAt: "desc" },
            take: limit,
            include: { actor: { select: { fullName: true, email: true } } },
          })
        : Promise.resolve([]),
      prisma.aILog.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);

    const sceneById = new Map(scenes.map((s) => [s.id, s]));
    const frameById = new Map(frames.map((f) => [f.id, f]));
    const epById    = new Map(episodes.map((e) => [e.id, e]));
    const charById  = new Map(characters.map((c) => [c.id, c]));
    const mediaById = new Map(characterMedia.map((m) => [m.id, m]));

    function labelFor(entityType: string, entityId: string): string {
      if (entityType === "Scene") {
        const s = sceneById.get(entityId);
        return s ? `SC${String(s.sceneNumber).padStart(2, "0")} ${s.title ?? ""}`.trim() : `scene ${entityId.slice(-6)}`;
      }
      if (entityType === "SceneFrame") {
        const f = frameById.get(entityId);
        if (!f) return `frame ${entityId.slice(-6)}`;
        const sc = sceneById.get(f.sceneId);
        return sc ? `SC${String(sc.sceneNumber).padStart(2, "0")} · frame ${f.orderIndex + 1}` : `frame ${f.orderIndex + 1}`;
      }
      if (entityType === "Episode") {
        const e = epById.get(entityId);
        return e ? `EP${String(e.episodeNumber).padStart(2, "0")} ${e.title}` : `episode ${entityId.slice(-6)}`;
      }
      if (entityType === "Character") {
        return charById.get(entityId)?.name ?? `character ${entityId.slice(-6)}`;
      }
      if (entityType === "CharacterMedia") {
        const m = mediaById.get(entityId);
        const char = m ? charById.get(m.characterId) : null;
        const angle = (m?.metadata as { angle?: string } | null)?.angle ?? "";
        return char ? `${char.name}${angle ? ` · ${angle}` : ""}` : `media ${entityId.slice(-6)}`;
      }
      return `${entityType} ${entityId.slice(-6)}`;
    }

    const rows: Row[] = [];

    for (const a of audits) {
      const title = labelFor(a.entityType, a.entityId);
      let kind = `${a.entityType.toLowerCase()}-${a.action.toLowerCase()}`;
      // Nicer categories
      if (a.entityType === "SceneFrame" && a.action === "CREATE") kind = "frame-created";
      if (a.entityType === "SceneFrame" && a.action === "UPDATE") kind = "frame-updated";
      if (a.entityType === "Scene" && a.action === "UPDATE") kind = "scene-edited";
      if (a.entityType === "Scene" && a.action === "CREATE") kind = "scene-created";
      if (a.entityType === "CharacterMedia" && a.action === "CREATE") kind = "character-image-created";
      if (a.entityType === "Character" && a.action === "UPDATE") kind = "character-edited";
      if (a.entityType === "Episode" && a.action === "UPDATE") kind = "episode-edited";
      if (a.entityType === "Episode" && a.action === "CREATE") kind = "episode-created";
      rows.push({
        id: a.id, at: a.createdAt.toISOString(), kind,
        actor: a.actor?.fullName ?? a.actor?.email ?? null,
        title, detail: a.action,
        entityType: a.entityType, entityId: a.entityId,
        meta: a.newValue ?? a.oldValue,
      });
    }

    // Add asset creations (videos are stored via webhook, no audit fires there)
    for (const asset of assets) {
      const scene = asset.entityType === "SCENE" ? sceneById.get(asset.entityId) : null;
      rows.push({
        id: `asset-${asset.id}`,
        at: asset.createdAt.toISOString(),
        kind: asset.assetType === "VIDEO" ? "video-created" : "asset-created",
        actor: null,
        title: scene ? `SC${String(scene.sceneNumber).padStart(2, "0")} ${scene.title ?? ""} · ${asset.assetType}` : asset.assetType,
        detail: "fal webhook",
        entityType: asset.entityType, entityId: asset.entityId,
        meta: asset.metadata,
      });
    }

    // AI Director actions (episode generation, feedback, autopilot runs)
    for (const l of ai) {
      rows.push({
        id: `ai-${l.id}`,
        at: l.createdAt.toISOString(),
        kind: `ai-${l.actionType.toLowerCase()}`,
        actor: l.actorType,
        title: l.actionType.replace(/_/g, " "),
        detail: l.decisionReason ?? undefined,
        entityType: "AI",
        entityId: l.id,
        meta: l.output,
      });
    }

    rows.sort((a, b) => b.at.localeCompare(a.at));
    return ok({ rows: rows.slice(0, limit), totalScenes: scenes.length, totalFrames: frames.length });
  } catch (e) { return handleError(e); }
}
