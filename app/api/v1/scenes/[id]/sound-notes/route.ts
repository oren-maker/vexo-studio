/**
 * AI-generates Sound Notes for a scene from the script + director sheet + cast.
 * Saved into scene.memoryContext.soundNotes.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqChat } from "@/lib/groq";
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
    const sheetAudio = mem.directorSheet?.audio ?? "";

    const user = [
      project && `Series: ${project.name} (${project.language}${project.genreTag ? ", " + project.genreTag : ""})`,
      `EP${scene.episode?.episodeNumber} · SC${scene.sceneNumber} ${scene.title ?? ""}`,
      scene.summary && `Summary: ${scene.summary.slice(0, 300)}`,
      scene.scriptText && `Script:\n${scene.scriptText.slice(0, 1000)}`,
      sheetAudio && `Director sheet [Audio] section: ${sheetAudio.slice(0, 300)}`,
      mem.directorNotes && `Director notes: ${mem.directorNotes.slice(0, 200)}`,
    ].filter(Boolean).join("\n\n");

    const SYSTEM = `You are a professional sound designer for film/TV. Read the script and write the SOUND NOTES for this scene as a single Hebrew paragraph (150-250 words). Cover ALL of these layers explicitly:
1. Music — genre, mood arc (builds/recedes), instrumentation
2. Foreground SFX — every important sound from the script's actions (footsteps, doors, phone rings, glass breaking, etc.)
3. Mid-layer ambience — room tone, environment, weather
4. Dialogue treatment — clear and intimate? whispered? overlapping? include any V.O. cues
5. Specific moments — pin sound cues to script beats with timestamps if possible

Be concrete and director-ready, not generic. Output ONLY the paragraph, no JSON, no labels.`;

    const text = await groqChat(
      [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      { temperature: 0.6, maxTokens: 600, projectId: undefined, description: `Sound notes · scene ${scene.sceneNumber}` },
    );

    const merged = { ...(scene.memoryContext as object ?? {}), soundNotes: text.trim() };
    await prisma.scene.update({ where: { id: params.id }, data: { memoryContext: merged as object } });
    return ok({ sceneId: params.id, soundNotes: text.trim() });
  } catch (e) { return handleError(e); }
}
