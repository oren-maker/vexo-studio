import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/**
 * Unified AI usage log for the project. Merges three sources so nothing is
 * invisible on the AI Director page:
 *  1. AILog         — decisions + rationale (context refresh, feedback, etc.)
 *  2. CostEntry     — every paid op (Gemini text, nano-banana image, fal video)
 *  3. AuditLog      — SceneFrame/Scene/Episode/Character creates tied to AI
 *                     sessions (filtered to CREATE/UPDATE on those models)
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_logs"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);

    const [ai, costs, scenes, episodes, frames, characters] = await Promise.all([
      prisma.aILog.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.costEntry.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.scene.findMany({ where: { episode: { season: { series: { projectId: params.id } } } }, select: { id: true, sceneNumber: true, title: true } }),
      prisma.episode.findMany({ where: { season: { series: { projectId: params.id } } }, select: { id: true, episodeNumber: true, title: true } }),
      prisma.sceneFrame.findMany({ where: { scene: { episode: { season: { series: { projectId: params.id } } } } }, select: { id: true, sceneId: true, orderIndex: true } }),
      prisma.character.findMany({ where: { projectId: params.id }, select: { id: true, name: true } }),
    ]);

    const sceneById = new Map(scenes.map((s) => [s.id, s]));
    const frameById = new Map(frames.map((f) => [f.id, f]));
    const epById    = new Map(episodes.map((e) => [e.id, e]));
    const charById  = new Map(characters.map((c) => [c.id, c]));

    type Row = {
      id: string;
      at: string;
      source: "ailog" | "cost";
      actionType: string;
      actorType: string | null;
      entityLabel: string;
      costUsd: number | null;
      description: string | null;
      input?: unknown;
      output?: unknown;
    };
    const rows: Row[] = [];

    for (const l of ai) {
      rows.push({
        id: `ai-${l.id}`,
        at: l.createdAt.toISOString(),
        source: "ailog",
        actionType: l.actionType,
        actorType: l.actorType ?? null,
        entityLabel: l.actionType.replace(/_/g, " "),
        costUsd: l.cost ?? null,
        description: l.decisionReason ?? null,
        input: l.input,
        output: l.output,
      });
    }

    const labelForCost = (c: typeof costs[number]): string => {
      if (c.entityType === "FRAME") {
        const f = frameById.get(c.entityId);
        if (f) {
          const sc = sceneById.get(f.sceneId);
          return sc ? `SC${String(sc.sceneNumber).padStart(2, "0")} · frame ${f.orderIndex + 1}` : `frame ${f.orderIndex + 1}`;
        }
      }
      if (c.entityType === "SCENE") {
        const sc = sceneById.get(c.entityId);
        return sc ? `SC${String(sc.sceneNumber).padStart(2, "0")} ${sc.title ?? ""}`.trim() : `scene ${c.entityId.slice(-6)}`;
      }
      if (c.entityType === "EPISODE") {
        const e = epById.get(c.entityId);
        return e ? `EP${String(e.episodeNumber).padStart(2, "0")} ${e.title}` : `episode ${c.entityId.slice(-6)}`;
      }
      if (c.entityType === "CHARACTER" || c.entityType === "CHARACTER_MEDIA") {
        const name = charById.get(c.entityId)?.name;
        return name ?? `character ${c.entityId.slice(-6)}`;
      }
      if (c.entityType === "SEASON_OPENING") return "פתיחת עונה · Opening";
      if (c.entityType === "AI_TEXT") return "AI text (project-wide)";
      return `${c.entityType} ${c.entityId.slice(-6)}`;
    };

    const classifyAction = (c: typeof costs[number]): string => {
      const d = (c.description ?? "").toLowerCase();
      // Entity-type and description-prefix checks first — only fall back to
      // model-name heuristics after the explicit matches.
      if (c.entityType === "SEASON_OPENING") return "OPENING";
      if (d.startsWith("opening")) return "OPENING";
      if (d.includes("director sheet")) return "DIRECTOR_SHEET";
      if (d.includes("sound")) return "SOUND_NOTES";
      if (d.includes("critic")) return "CRITIC";
      if (d.includes("breakdown")) return "BREAKDOWN";
      if (d.includes("dialogue")) return "DIALOGUE";
      if (d.includes("seo")) return "SEO";
      if (c.entityType === "CHARACTER_MEDIA") return "CHARACTER_GALLERY";
      if (c.entityType === "FRAME" || d.includes("nano-banana") || d.includes("image ")) return "IMAGE_GEN";
      if (d.includes("seedance") || d.includes("kling") || d.includes("veo") || d.includes("video")) return "VIDEO_GEN";
      if (d.includes("gemini") || c.entityType === "AI_TEXT") return "TEXT_AI";
      return c.costCategory;
    };

    for (const c of costs) {
      rows.push({
        id: `cost-${c.id}`,
        at: c.createdAt.toISOString(),
        source: "cost",
        actionType: classifyAction(c),
        actorType: null,
        entityLabel: labelForCost(c),
        costUsd: c.totalCost,
        description: c.description,
      });
    }

    rows.sort((a, b) => b.at.localeCompare(a.at));
    return ok(rows.slice(0, 400));
  } catch (e) { return handleError(e); }
}
