/**
 * AI-generate scenes for an existing episode. Reads the full series context
 * (bible, prior episodes, cast with arcs) so the new scenes continue the
 * storyline rather than inventing in a vacuum.
 *
 * POST /api/v1/episodes/[id]/scenes/generate-ai
 * Body: { scenesCount?: 2-8 (default 4), framesPerScene?: 2-6 (default 3) }
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { getContext } from "@/lib/project-context";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  scenesCount: z.number().int().min(2).max(8).default(4),
  framesPerScene: z.number().int().min(2).max(6).default(3),
  hint: z.string().optional(),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let stage = "init";
  async function step<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    stage = label;
    try { return await fn(); }
    catch (e) {
      throw Object.assign(new Error(`[${label}] ${(e as Error).message ?? String(e)}`), {
        statusCode: (e as { statusCode?: number }).statusCode ?? 500,
        stack: (e as Error).stack,
      });
    }
  }

  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const episode = await prisma.episode.findFirst({
      where: { id: params.id, season: { series: { project: { organizationId: ctx.organizationId } } } },
      include: {
        season: { include: { series: { include: { project: true } } } },
        scenes: { orderBy: { sceneNumber: "asc" }, select: { id: true, sceneNumber: true, title: true, summary: true } },
        characters: { include: { character: { select: { id: true, name: true, roleType: true, appearance: true } } } },
      },
    });
    if (!episode) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
    (await import("@/lib/request-context")).setActiveProject(episode.season.series.projectId);

    const seriesId = episode.season.seriesId;
    const prior = await prisma.episode.findMany({
      where: { season: { seriesId }, episodeNumber: { lt: episode.episodeNumber } },
      orderBy: { episodeNumber: "asc" },
      select: {
        episodeNumber: true, title: true, synopsis: true,
        scenes: { orderBy: { sceneNumber: "asc" }, select: { sceneNumber: true, title: true, summary: true } },
      },
    });

    const ctxCache = await getContext(episode.season.series.projectId);
    const bible = ctxCache?.summary ?? [
      `# ${episode.season.series.project.name}`,
      episode.season.series.project.description ?? "",
      `Genre: ${episode.season.series.project.genreTag ?? "—"}`,
      `Language: ${episode.season.series.project.language}`,
    ].filter(Boolean).join("\n");

    const priorDigest = prior.length === 0
      ? "(first episode of the series)"
      : prior.map((p) => {
          const sceneLines = p.scenes.slice(0, 6).map((s) => `    · SC${s.sceneNumber}: ${s.title ?? "—"}${s.summary ? ` — ${s.summary.slice(0, 120)}` : ""}`).join("\n");
          return `EP${p.episodeNumber} "${p.title}": ${p.synopsis ?? ""}${sceneLines ? `\n${sceneLines}` : ""}`;
        }).join("\n\n");

    const castBlock = episode.characters.length > 0
      ? episode.characters.map((ec) => `- ${ec.character.name}${ec.character.roleType ? ` (${ec.character.roleType})` : ""}: ${(ec.character.appearance ?? "").slice(0, 140)}`).join("\n")
      : "(no cast linked to this episode — you may introduce characters from the series bible)";

    const existing = episode.scenes.length === 0
      ? "(this episode has no scenes yet — generate the opening run)"
      : `This episode already has ${episode.scenes.length} scenes (SC01..SC${String(episode.scenes.length).padStart(2, "0")}). Continue from where they left off — pick up after the last scene, do NOT repeat beats already covered:\n${episode.scenes.map((s) => `  SC${s.sceneNumber}: ${s.title ?? "—"}${s.summary ? ` — ${s.summary.slice(0, 100)}` : ""}`).join("\n")}`;

    const scenesCount = body.scenesCount ?? 4;
    const framesPerScene = body.framesPerScene ?? 3;

    const plan = await step("scenes-ai", () => groqJson<{ scenes?: { title?: string; summary?: string; scriptText?: string; location?: string; mood?: string; characterNames?: string[] }[] }>(
      `You are a series writer continuing an established show. Plan ${scenesCount} scenes that advance the arc of THIS episode while staying consistent with every prior episode, every established character, and the bible. Each scene must have dialogue-driven scriptText (4-8 screenplay lines in the series' language). Return JSON { scenes: [{ title, summary, scriptText, location, mood, characterNames: string[] }] }.`,
      `BIBLE:\n${bible}\n\nPRIOR EPISODES (chronological):\n${priorDigest}\n\nCURRENT EPISODE #${episode.episodeNumber} — "${episode.title}"\nSynopsis: ${episode.synopsis ?? "(none)"}\n\n[Cast in this episode]\n${castBlock}\n\n[Existing scenes in THIS episode]\n${existing}${body.hint ? `\n\nAUTHOR HINT: ${body.hint}` : ""}\n\nLANGUAGE: ${episode.season.series.project.language}`,
      { temperature: 0.85, maxTokens: 4000 },
    ).catch((e: Error) => { throw e; }));

    const planned = Array.isArray(plan?.scenes) ? plan.scenes : [];
    if (planned.length === 0) {
      throw Object.assign(new Error("AI returned no scenes — try again or provide a hint"), { statusCode: 502 });
    }

    const startingNumber = episode.scenes.length + 1;
    const created = await step("scenes-persist", () => Promise.all(
      planned.slice(0, scenesCount).map(async (sp, idx) => {
        if (!sp?.title || !sp?.scriptText) return null;
        const scene = await prisma.scene.create({
          data: {
            parentType: "EPISODE", parentId: episode.id, episodeId: episode.id,
            sceneNumber: startingNumber + idx,
            title: sp.title,
            summary: sp.summary ?? null,
            scriptText: sp.scriptText,
            scriptSource: "AI_GENERATED",
            targetDurationSeconds: 60,
            status: "STORYBOARD_REVIEW",
            memoryContext: { location: sp.location, mood: sp.mood, characters: sp.characterNames ?? [] } as object,
          },
        });

        const fp = await groqJson<{ frames?: { beatSummary?: string; imagePrompt?: string; negativePrompt?: string }[] }>(
          `Plan ${framesPerScene} storyboard frames for the scene below. Return JSON { frames: [{ beatSummary, imagePrompt, negativePrompt }] }. Each imagePrompt must be photorealistic and cinematic — specify lens, lighting, framing.`,
          `Scene: ${sp.title}\nMood: ${sp.mood ?? "—"}\nLocation: ${sp.location ?? "—"}\nCharacters: ${(sp.characterNames ?? []).join(", ") || "—"}\n\n${sp.scriptText}`,
          { temperature: 0.7, maxTokens: 1200 },
        ).catch(() => ({ frames: [] as { beatSummary?: string; imagePrompt?: string; negativePrompt?: string }[] }));
        const validFrames = (Array.isArray(fp?.frames) ? fp.frames : []).filter((fr) => fr?.imagePrompt).slice(0, framesPerScene);
        if (validFrames.length > 0) {
          await prisma.sceneFrame.createMany({
            data: validFrames.map((fr, fi) => ({
              sceneId: scene.id,
              orderIndex: fi,
              beatSummary: fr.beatSummary ?? null,
              imagePrompt: fr.imagePrompt!,
              negativePrompt: fr.negativePrompt ?? null,
              status: "PENDING",
            })),
            skipDuplicates: true,
          });
        }
        return { sceneId: scene.id, sceneNumber: scene.sceneNumber, title: scene.title, frames: validFrames.length };
      }),
    ));

    const okScenes = created.filter((s): s is NonNullable<typeof s> => s !== null);
    return ok({
      episodeId: episode.id,
      scenesCreated: okScenes.length,
      framesCreated: okScenes.reduce((a, s) => a + s.frames, 0),
      scenes: okScenes,
      priorEpisodesReviewed: prior.length,
      castConsidered: episode.characters.length,
    });
  } catch (e) {
    const err = e as { message?: string; statusCode?: number; stack?: string };
    if (!err.message?.startsWith("[")) err.message = `[${stage}] ${err.message ?? "unknown"}`;
    return handleError(err);
  }
}
