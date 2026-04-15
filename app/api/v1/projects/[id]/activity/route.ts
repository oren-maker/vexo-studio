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

    // Phase 1 — pull root entities (scenes/episodes/characters) and the
    // project-keyed feeds (assets, ai logs, costs) in parallel. These are
    // either indexed on projectId directly or trivially indexed.
    // Frames + characterMedia are deferred to phase 2 because they're
    // cheaper as IN-queries on sceneId/characterId than as 4-level joins
    // through season → series → project.
    const [scenes, episodes, characters, assets, ai, costs] = await Promise.all([
      prisma.scene.findMany({ where: { episode: { season: { series: { projectId: params.id } } } }, select: { id: true, sceneNumber: true, title: true, episodeId: true } }),
      prisma.episode.findMany({ where: { season: { series: { projectId: params.id } } }, select: { id: true, episodeNumber: true, title: true } }),
      prisma.character.findMany({ where: { projectId: params.id }, select: { id: true, name: true } }),
      prisma.asset.findMany({ where: { projectId: params.id }, select: { id: true, entityType: true, entityId: true, assetType: true, createdAt: true, metadata: true } }),
      prisma.aILog.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.costEntry.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);

    const sceneIds = scenes.map((s) => s.id);
    const characterIdList = characters.map((c) => c.id);

    // Phase 2 — frames + characterMedia + audits, all simple IN-queries on
    // indexed columns (sceneId, characterId, entityId). Auditlog gets the
    // full entityId list once we have it, so it scans the (entityType,
    // entityId) index directly instead of a giant cross-join.
    const [frames, characterMedia] = await Promise.all([
      sceneIds.length > 0
        ? prisma.sceneFrame.findMany({ where: { sceneId: { in: sceneIds } }, select: { id: true, orderIndex: true, sceneId: true } })
        : Promise.resolve([] as { id: string; orderIndex: number; sceneId: string }[]),
      characterIdList.length > 0
        ? prisma.characterMedia.findMany({ where: { characterId: { in: characterIdList } }, select: { id: true, characterId: true, mediaType: true, metadata: true, createdAt: true } })
        : Promise.resolve([] as { id: string; characterId: string; mediaType: string; metadata: unknown; createdAt: Date }[]),
    ]);

    const entityIds = [
      ...sceneIds,
      ...frames.map((f) => f.id),
      ...episodes.map((e) => e.id),
      ...characterIdList,
      ...characterMedia.map((m) => m.id),
    ];

    const audits = entityIds.length > 0
      ? await prisma.auditLog.findMany({
          where: { organizationId: ctx.organizationId, entityId: { in: entityIds } },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { actor: { select: { fullName: true, email: true } } },
        })
      : [];

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

    // Every paid operation. Classify by description so the UI can color/group.
    const classifyCost = (description: string | null, entityType: string): string => {
      const d = (description ?? "").toLowerCase();
      if (entityType === "FRAME" || d.includes("nano-banana") || d.includes("image ")) return "cost-image";
      if (d.includes("video") || d.includes("seedance") || d.includes("kling") || d.includes("veo")) return "cost-video";
      if (d.includes("director sheet")) return "cost-director-sheet";
      if (d.includes("sound")) return "cost-sound-notes";
      if (d.includes("critic")) return "cost-critic";
      if (d.includes("breakdown")) return "cost-breakdown";
      if (d.includes("dialogue")) return "cost-dialogue";
      if (d.includes("seo")) return "cost-seo";
      if (d.includes("subtitle")) return "cost-subtitles";
      if (d.includes("dubbing")) return "cost-dubbing";
      if (d.includes("gemini") || entityType === "AI_TEXT") return "cost-text-ai";
      if (entityType === "CHARACTER_MEDIA") return "cost-character-image";
      return "cost-other";
    };
    const costTitle = (c: typeof costs[number]): string => {
      // Prefer a human label tied to the entity the cost was against
      if (c.entityType === "FRAME") {
        const f = frameById.get(c.entityId);
        if (f) {
          const sc = sceneById.get(f.sceneId);
          return sc ? `SC${String(sc.sceneNumber).padStart(2, "0")} · frame ${f.orderIndex + 1} — ${c.description ?? ""}` : `frame ${f.orderIndex + 1}`;
        }
      }
      if (c.entityType === "SCENE") {
        const sc = sceneById.get(c.entityId);
        return sc ? `SC${String(sc.sceneNumber).padStart(2, "0")} ${sc.title ?? ""} — ${c.description ?? ""}`.trim() : `scene — ${c.description ?? ""}`;
      }
      if (c.entityType === "CHARACTER_MEDIA") {
        const m = mediaById.get(c.entityId);
        const char = m ? charById.get(m.characterId) : null;
        return char ? `${char.name} — ${c.description ?? ""}` : `character image — ${c.description ?? ""}`;
      }
      return c.description ?? c.entityType;
    };
    for (const c of costs) {
      rows.push({
        id: `cost-${c.id}`,
        at: c.createdAt.toISOString(),
        kind: classifyCost(c.description, c.entityType),
        actor: null,
        title: costTitle(c),
        detail: `$${c.totalCost.toFixed(4)}`,
        entityType: c.entityType,
        entityId: c.entityId,
      });
    }

    rows.sort((a, b) => b.at.localeCompare(a.at));
    return ok({ rows: rows.slice(0, limit), totalScenes: scenes.length, totalFrames: frames.length });
  } catch (e) { return handleError(e); }
}
