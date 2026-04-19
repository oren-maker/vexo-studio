import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse, requirePermission } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";

// Duplicates a scene as a fresh DRAFT within the same episode.
// Copies scriptText, summary, title (with " (copy)" suffix), targetDuration.
// Does NOT copy: status (reset to DRAFT), memoryContext (bridgeFrame, sheet,
// shotList all scene-specific), frames, videos, logs. Cheaper than retyping
// a 400-word scriptText.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;

    const src = await prisma.scene.findUnique({
      where: { id: params.id },
      select: { episodeId: true, parentType: true, parentId: true, title: true, summary: true, scriptText: true, targetDurationSeconds: true, styleConstraints: true },
    });
    if (!src || !src.episodeId) throw Object.assign(new Error("source scene not found (or no episode)"), { statusCode: 404 });

    const last = await prisma.scene.findFirst({
      where: { episodeId: src.episodeId },
      orderBy: { sceneNumber: "desc" },
      select: { sceneNumber: true },
    });
    const nextNumber = (last?.sceneNumber ?? 0) + 1;

    const copy = await prisma.scene.create({
      data: {
        parentType: src.parentType,
        parentId: src.parentId,
        episodeId: src.episodeId,
        sceneNumber: nextNumber,
        title: src.title ? `${src.title} (copy)` : null,
        summary: src.summary,
        scriptText: src.scriptText,
        scriptSource: "duplicate",
        targetDurationSeconds: src.targetDurationSeconds,
        styleConstraints: (src.styleConstraints ?? undefined) as object | undefined,
        status: "DRAFT",
      },
      include: { episode: { select: { seasonId: true } } },
    });

    await (prisma as any).sceneLog.create({
      data: {
        sceneId: copy.id,
        action: "scene_duplicated",
        actor: "user",
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: { fromSceneId: params.id, newSceneNumber: nextNumber },
      },
    }).catch(() => {});

    return ok({
      newSceneId: copy.id,
      sceneNumber: nextNumber,
      url: copy.episode ? `/seasons/${copy.episode.seasonId}/episodes/${copy.episodeId}/scenes/${copy.id}` : `/scenes/${copy.id}`,
    });
  } catch (e) { return handleError(e); }
}
