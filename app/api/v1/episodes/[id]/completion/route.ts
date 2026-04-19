import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";

// Episode completion checklist.
// Returns a structured list of everything that's "done vs missing" so the UI
// can render a progress bar + actionable todos. Lightweight — single query
// with smart selects; no Gemini calls, no external APIs.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;

    const episode = await prisma.episode.findUnique({
      where: { id: params.id },
      include: {
        season: { include: { series: { select: { title: true } } } },
        scenes: {
          orderBy: { sceneNumber: "asc" },
          select: {
            id: true, sceneNumber: true, title: true, status: true,
            scriptText: true, summary: true, memoryContext: true,
            frames: { select: { id: true } },
            criticReviews: { select: { id: true } },
          },
        },
      },
    });
    if (!episode) throw Object.assign(new Error("episode not found"), { statusCode: 404 });

    // Fetch thumbnail + recap existence in one roundtrip
    const [thumb, recap] = await Promise.all([
      prisma.asset.findFirst({ where: { entityType: "EPISODE", entityId: params.id, assetType: "THUMBNAIL" }, select: { id: true } }),
      prisma.asset.findFirst({ where: { entityType: "EPISODE", entityId: params.id, assetType: "RECAP" }, select: { id: true } }),
    ]);

    type SceneCheck = {
      sceneId: string;
      sceneNumber: number;
      title: string | null;
      status: string;
      hasScript: boolean;
      hasSummary: boolean;
      hasFrames: boolean;
      hasDirectorSheet: boolean;
      hasSoundNotes: boolean;
      hasCriticReview: boolean;
      hasBridgeFrame: boolean;
      isApproved: boolean;
    };

    const sceneChecks: SceneCheck[] = episode.scenes.map((s) => {
      const mem = (s.memoryContext as Record<string, unknown> | null) ?? {};
      return {
        sceneId: s.id,
        sceneNumber: s.sceneNumber,
        title: s.title,
        status: s.status,
        hasScript: !!(s.scriptText && s.scriptText.length > 20),
        hasSummary: !!s.summary,
        hasFrames: s.frames.length > 0,
        hasDirectorSheet: !!mem.directorSheet,
        hasSoundNotes: !!mem.soundNotes,
        hasCriticReview: s.criticReviews.length > 0,
        hasBridgeFrame: typeof mem.bridgeFrameUrl === "string",
        isApproved: s.status === "APPROVED" || s.status === "LOCKED",
      };
    });

    // Build flat todo list — things the user should act on, most urgent first
    const todos: { kind: string; label: string; sceneId?: string; sceneNumber?: number; priority: 1 | 2 | 3 }[] = [];
    for (const c of sceneChecks) {
      if (!c.hasScript) todos.push({ kind: "missing_script", label: `סצנה ${c.sceneNumber}: אין scriptText`, sceneId: c.sceneId, sceneNumber: c.sceneNumber, priority: 1 });
      if (!c.hasDirectorSheet) todos.push({ kind: "missing_director_sheet", label: `סצנה ${c.sceneNumber}: אין Director Sheet`, sceneId: c.sceneId, sceneNumber: c.sceneNumber, priority: 2 });
      if (!c.hasSoundNotes) todos.push({ kind: "missing_sound_notes", label: `סצנה ${c.sceneNumber}: אין Sound Notes`, sceneId: c.sceneId, sceneNumber: c.sceneNumber, priority: 3 });
      if (c.hasScript && !c.hasFrames && c.status !== "DRAFT") todos.push({ kind: "missing_frames", label: `סצנה ${c.sceneNumber}: אין storyboard frames`, sceneId: c.sceneId, sceneNumber: c.sceneNumber, priority: 2 });
      if (!c.hasCriticReview && c.hasScript) todos.push({ kind: "missing_critic", label: `סצנה ${c.sceneNumber}: אין ביקורת AI`, sceneId: c.sceneId, sceneNumber: c.sceneNumber, priority: 3 });
      if (!c.isApproved && c.status === "VIDEO_REVIEW") todos.push({ kind: "pending_approval", label: `סצנה ${c.sceneNumber}: ממתינה לאישור`, sceneId: c.sceneId, sceneNumber: c.sceneNumber, priority: 2 });
    }
    if (!thumb) todos.push({ kind: "missing_thumbnail", label: `אין thumbnail לפרק`, priority: 3 });
    if (!recap && sceneChecks.some((c) => c.hasBridgeFrame)) todos.push({ kind: "missing_recap", label: `recap לא נוצר עדיין (bridge frames קיימים)`, priority: 3 });

    todos.sort((a, b) => a.priority - b.priority || (a.sceneNumber ?? 999) - (b.sceneNumber ?? 999));

    // Progress metrics — how "done" is the episode overall?
    const sceneCount = sceneChecks.length;
    const approved = sceneChecks.filter((c) => c.isApproved).length;
    const withScripts = sceneChecks.filter((c) => c.hasScript).length;
    const withFrames = sceneChecks.filter((c) => c.hasFrames).length;
    const withDirectorSheet = sceneChecks.filter((c) => c.hasDirectorSheet).length;

    const overallPct = sceneCount > 0
      ? Math.round(100 * (approved / sceneCount))
      : 0;

    return ok({
      episode: {
        id: episode.id,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        status: episode.status,
        seriesTitle: episode.season?.series?.title ?? null,
      },
      metrics: {
        sceneCount,
        approved,
        withScripts,
        withFrames,
        withDirectorSheet,
        overallPct,
        hasThumbnail: !!thumb,
        hasRecap: !!recap,
      },
      sceneChecks,
      todos,
    });
  } catch (e) { return handleError(e); }
}
