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

    const SYSTEM = `You are a senior production sound designer + dialogue editor for a TV series. Read the FULL script line by line and write detailed SOUND NOTES in Hebrew (300-450 words) — this goes straight to a video model that needs to hear EVERY layer.

Output the notes as 6 LABELED sections in Hebrew, each with concrete specifics drawn from the script (no generic placeholders, no 'tense music'):

🎵 מוזיקה: genre, instruments (specific: piano + cello + sub-bass synth), BPM range, when it enters/builds/recedes, what emotion it carries — tied to script beats by timecode.

🔊 אפקטים מקדמת התמונה (Foley/SFX): list EVERY action from the script as its own SFX cue — footsteps on what surface, door (open/close how hard), keyboards, phone (ring tone? haptic?), paper rustle, breath, glass, etc. One bullet per cue with timestamp if clear.

🌫 אמביינס/רעש סביבה: 3-6 specific environmental sounds layered under (e.g. distant traffic through window, fluorescent buzz at 60Hz, server room hum, rain on glass). Be precise about volume and panning.

🎙 דיאלוג ולחץ שפתיים (Lip-sync): for EACH line of dialogue in the script, write: speaker name → exact line → emotion (tense / whispered / loud / breathy) → lip-sync direction (tight close-sync; off-screen V.O.; phone-filtered; whispered). Include any breath/pause beats between lines.

🎚 מעברי סאונד וצמצומים (Mix moves): how dialogue ducks music, when ambience drops out for impact, any swell/cut/silence beats. Pin to script moments.

⚡ רגעים מיוחדים: specific punch-in moments (ringing phone breaking silence, memory flash sting, heart-thump sub-drop, etc.) with exact timing.

Stay grounded in THIS script's exact words and characters — name them. No generic 'newsroom ambience' — describe WHICH newsroom sounds (which keyboards, which TVs, which voices). Output Hebrew, no English headers other than the emojis.`;

    const text = await groqChat(
      [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      { temperature: 0.5, maxTokens: 1500, projectId: undefined, description: `Sound notes · scene ${scene.sceneNumber}` },
    );

    const merged = { ...(scene.memoryContext as object ?? {}), soundNotes: text.trim() };
    await prisma.scene.update({ where: { id: params.id }, data: { memoryContext: merged as object } });
    return ok({ sceneId: params.id, soundNotes: text.trim() });
  } catch (e) { return handleError(e); }
}
