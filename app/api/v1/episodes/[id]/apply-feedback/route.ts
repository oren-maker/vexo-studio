/**
 * Take AI Director feedback (or freshly generate) and APPLY it to the episode:
 *  - Rewrites each scene's summary + scriptText incorporating the suggestions
 *  - Updates episode synopsis if a generalSynopsisRewrite was suggested
 *  - Saves a SceneVersion snapshot per scene before modifying (so we can rollback)
 *  - Logs the action in ai_logs
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  // If feedback already shown to user, pass it back; otherwise generate fresh
  feedback: z.object({
    overall: z.string().optional(),
    strengths: z.array(z.string()).optional(),
    concerns: z.array(z.string()).optional(),
    suggestions: z.array(z.string()).optional(),
    sceneNotes: z.array(z.object({ sceneNumber: z.number(), note: z.string() })).optional(),
  }).optional(),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const ep = await prisma.episode.findFirst({
      where: { id: params.id, season: { series: { project: { organizationId: ctx.organizationId } } } },
      include: {
        season: { include: { series: { include: { project: true } } } },
        scenes: { orderBy: { sceneNumber: "asc" } },
      },
    });
    if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });

    // 1. Get feedback (use provided or generate)
    let fb = body.feedback;
    if (!fb || !(fb.suggestions?.length || fb.sceneNotes?.length || fb.concerns?.length)) {
      const sceneSummary = ep.scenes.map((s) => `Scene ${s.sceneNumber}${s.title ? ` (${s.title})` : ""} [${s.status}]\n${s.summary ?? ""}\n${s.scriptText?.slice(0, 600) ?? ""}`).join("\n\n");
      fb = await groqJson(
        "You are a veteran TV showrunner. Return JSON: { overall, strengths: [], concerns: [], suggestions: [], sceneNotes: [{ sceneNumber, note }] }",
        `Episode #${ep.episodeNumber}: ${ep.title}\nSynopsis: ${ep.synopsis ?? "—"}\n\nScenes:\n${sceneSummary}`,
        { temperature: 0.5, maxTokens: 1500 },
      );
    }

    const suggestionList = (fb?.suggestions ?? []).join("\n- ");
    const concernList = (fb?.concerns ?? []).join("\n- ");
    const sceneNoteMap = new Map<number, string>();
    for (const n of fb?.sceneNotes ?? []) sceneNoteMap.set(n.sceneNumber, n.note);

    const guidanceShared = `OVERALL DIRECTION:\n${fb?.overall ?? ""}\n\nMUST FIX:\n- ${concernList || "(none)"}\n\nAPPLY SUGGESTIONS:\n- ${suggestionList || "(none)"}`;

    // 2. Rewrite each scene
    const rewrittenScenes: { sceneId: string; sceneNumber: number; before: { summary: string | null; scriptText: string | null }; after: { summary: string; scriptText: string } }[] = [];
    for (const scene of ep.scenes) {
      try {
        const sceneNote = sceneNoteMap.get(scene.sceneNumber) ?? "";
        const j = await groqJson<{ summary: string; scriptText: string }>(
          "Rewrite this scene to incorporate the director's feedback. Keep the same scene number, structure (4-8 lines of natural screenplay format), and approximate length. Strengthen the listed weaknesses, apply the suggestions, and address the scene-specific note. Return JSON: { summary, scriptText }",
          `${guidanceShared}\n\nSCENE-SPECIFIC NOTE: ${sceneNote || "(no scene-specific note)"}\n\nORIGINAL SCENE ${scene.sceneNumber}: ${scene.title ?? ""}\nORIGINAL SUMMARY: ${scene.summary ?? ""}\nORIGINAL SCRIPT:\n${scene.scriptText ?? ""}`,
          { temperature: 0.7, maxTokens: 1200 },
        );

        // Snapshot before mutating
        const lastVersion = await prisma.sceneVersion.findFirst({ where: { sceneId: scene.id }, orderBy: { versionNumber: "desc" } });
        await prisma.sceneVersion.create({
          data: {
            sceneId: scene.id,
            versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
            scriptSnapshot: scene.scriptText,
            promptSnapshot: { summary: scene.summary } as any,
            reviewNotes: `Auto-revised by AI Director feedback`,
            createdByUserId: ctx.user.id,
          },
        });

        await prisma.scene.update({
          where: { id: scene.id },
          data: { summary: j.summary, scriptText: j.scriptText, scriptSource: "AI_REVISED", status: "STORYBOARD_REVIEW" },
        });

        rewrittenScenes.push({
          sceneId: scene.id, sceneNumber: scene.sceneNumber,
          before: { summary: scene.summary, scriptText: scene.scriptText },
          after: { summary: j.summary, scriptText: j.scriptText },
        });
      } catch (e) {
        // continue with other scenes; don't blow up the whole apply
        console.warn(`Apply scene ${scene.sceneNumber} failed:`, (e as Error).message);
      }
    }

    // 3. Log the action
    await prisma.aILog.create({
      data: {
        projectId: ep.season.series.projectId,
        actorType: "DIRECTOR",
        actionType: "APPLY_FEEDBACK_EPISODE",
        input: { episodeId: ep.id, feedback: fb } as any,
        output: { rewrittenScenes: rewrittenScenes.length } as any,
        decisionReason: `Applied AI director feedback to ${rewrittenScenes.length}/${ep.scenes.length} scenes of EP${ep.episodeNumber}`,
      },
    });

    return ok({
      episodeId: ep.id,
      episodeTitle: ep.title,
      scenesRewritten: rewrittenScenes.length,
      scenesTotal: ep.scenes.length,
      details: rewrittenScenes,
    });
  } catch (e) { return handleError(e); }
}
