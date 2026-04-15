/**
 * Aggregate AI cost for a single scene: frame costs + scene-level costs + AI text
 * calls tagged with meta.sceneId. Grouped by tool so the UI can show a breakdown.
 *
 * GET /api/v1/scenes/[id]/ai-costs → { total, count, byTool: { [tool]: { total, count } } }
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

function classifyTool(description: string | null, entityType: string): string {
  const d = (description ?? "").toLowerCase();
  if (entityType === "FRAME" || d.includes("image") || d.includes("nano-banana") || d.includes("frame")) return "storyboard";
  if (d.includes("video") || d.includes("seedance") || d.includes("kling") || d.includes("veo")) return "video";
  if (d.includes("director sheet") || d.includes("director-sheet")) return "director-sheet";
  if (d.includes("sound") && d.includes("note")) return "sound-notes";
  if (d.includes("critic")) return "critic";
  if (d.includes("breakdown")) return "breakdown";
  if (d.includes("dialogue")) return "dialogue";
  if (d.includes("seo")) return "seo";
  if (d.includes("subtitle")) return "subtitles";
  if (d.includes("dubbing")) return "dubbing";
  if (d.includes("lipsync") || d.includes("lip sync")) return "lipsync";
  if (d.includes("gemini") || entityType === "AI_TEXT") return "text-ai";
  return "other";
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;

    const scene = await prisma.scene.findFirst({
      where: { id: params.id, OR: [
        { episode: { season: { series: { project: { organizationId: ctx.organizationId } } } } },
        { parentType: "EPISODE" }, // fallback
      ] },
      select: { id: true, frames: { select: { id: true } } },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });

    const frameIds = scene.frames.map((f) => f.id);

    const [frameCosts, sceneCosts, textCosts] = await Promise.all([
      frameIds.length > 0
        ? prisma.costEntry.findMany({ where: { entityType: "FRAME", entityId: { in: frameIds } } })
        : Promise.resolve([] as Awaited<ReturnType<typeof prisma.costEntry.findMany>>),
      prisma.costEntry.findMany({ where: { entityType: "SCENE", entityId: params.id } }),
      // AI text calls often get entityId=projectId, but the good ones tag meta.sceneId.
      // Cost table doesn't index meta, so we do a JSON filter here — cheap since the
      // AI_TEXT set per-project is small.
      prisma.costEntry.findMany({
        where: { entityType: "AI_TEXT", meta: { path: ["sceneId"], equals: params.id } } as never,
      }).catch(() => [] as Awaited<ReturnType<typeof prisma.costEntry.findMany>>),
    ]);

    const all = [...frameCosts, ...sceneCosts, ...textCosts];
    const byTool: Record<string, { total: number; count: number; latest: string | null }> = {};
    let total = 0;
    for (const c of all) {
      const tool = classifyTool(c.description, c.entityType);
      if (!byTool[tool]) byTool[tool] = { total: 0, count: 0, latest: null };
      byTool[tool].total += c.totalCost;
      byTool[tool].count++;
      const iso = c.createdAt.toISOString();
      if (!byTool[tool].latest || iso > byTool[tool].latest) byTool[tool].latest = iso;
      total += c.totalCost;
    }
    // Round for transport
    for (const t of Object.keys(byTool)) byTool[t].total = +byTool[t].total.toFixed(6);

    return ok({
      total: +total.toFixed(6),
      count: all.length,
      byTool,
    });
  } catch (e) { return handleError(e); }
}
