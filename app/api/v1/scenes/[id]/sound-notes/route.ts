/**
 * AI-generates Sound Notes for a scene from the script + director sheet + cast.
 * Saved into scene.memoryContext.soundNotes.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { generateSoundNotes } from "@/lib/sound-notes";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 45;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;

    const scene = await prisma.scene.findUnique({
      where: { id: params.id },
      select: {
        title: true, summary: true, scriptText: true, sceneNumber: true, memoryContext: true,
        episode: { select: { title: true, episodeNumber: true, season: { select: { series: { select: { project: { select: { name: true, language: true, genreTag: true, organizationId: true } } } } } } } },
      },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });

    const project = scene.episode?.season.series.project;
    if (project && project.organizationId !== ctx.organizationId) throw Object.assign(new Error("forbidden"), { statusCode: 403 });

    const mem = (scene.memoryContext as { directorSheet?: { audio?: string }; directorNotes?: string } | null) ?? {};

    const text = await generateSoundNotes({
      projectName: project?.name,
      language: project?.language,
      genre: project?.genreTag ?? undefined,
      episodeNumber: scene.episode?.episodeNumber,
      sceneNumber: scene.sceneNumber,
      sceneTitle: scene.title,
      summary: scene.summary,
      scriptText: scene.scriptText,
      directorSheetAudio: mem.directorSheet?.audio,
      directorNotes: mem.directorNotes,
    });

    const merged = { ...(scene.memoryContext as object ?? {}), soundNotes: text };
    await prisma.scene.update({ where: { id: params.id }, data: { memoryContext: merged as object } });
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: params.id,
        action: "sound_notes_generated",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: { wordCount: text.split(/\s+/).length, preview: text.slice(0, 200) },
      },
    }).catch(() => {});
    // CostEntry — Groq text-AI call, ~$0.003 estimated
    if (project) {
      const { chargeUsd } = await import("@/lib/billing");
      const seriesRow = await prisma.series.findFirst({ where: { seasons: { some: { episodes: { some: { scenes: { some: { id: params.id } } } } } } }, select: { projectId: true } });
      if (seriesRow?.projectId) {
        await chargeUsd({
          organizationId: ctx.organizationId, projectId: seriesRow.projectId,
          entityType: "SCENE", entityId: params.id,
          providerName: "Groq", category: "TOKEN",
          description: `AI Sound Notes · scene ${scene.sceneNumber ?? "?"}`,
          unitCost: 0.003, quantity: 1, userId: ctx.user.id,
        }).catch(() => {});
      }
    }
    return ok({ sceneId: params.id, soundNotes: text });
  } catch (e) { return handleError(e); }
}
