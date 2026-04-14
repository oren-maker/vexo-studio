/**
 * Generate ONE new episode, using the cached project context (series bible) as
 * primary context. Scenes + frames generated in parallel to fit the 60s cap.
 * If the cache is stale, it's refreshed first.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertEpisodeQuota } from "@/lib/plan-limits";
import { groqJson } from "@/lib/groq";
import { ensureFreshContext } from "@/lib/project-context";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  title: z.string().optional(),
  hint: z.string().optional(),
  scenesPerEpisode: z.number().int().min(2).max(8).default(4),
  framesPerScene: z.number().int().min(2).max(6).default(3),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: {
        series: { include: { project: true } },
        episodes: { orderBy: { episodeNumber: "asc" }, select: { id: true, episodeNumber: true, title: true, synopsis: true } },
      },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });
    await assertEpisodeQuota(ctx.organizationId, season.seriesId);

    // 1. Pull the cached series bible (refreshes if > 5 min old)
    const contextCache = await ensureFreshContext(season.series.projectId);
    const bible = contextCache?.summary ?? "";

    const characters = await prisma.character.findMany({ where: { projectId: season.series.projectId } });
    const nextNumber = (season.episodes.at(-1)?.episodeNumber ?? 0) + 1;

    // 2. Outline the new episode from the bible + the last 2 episodes' synopses
    const recent = season.episodes.slice(-2).map((e) => `EP${e.episodeNumber} "${e.title}": ${e.synopsis ?? ""}`).join("\n");

    const outline = await groqJson<{ title: string; synopsis: string; targetDurationSeconds: number; characterNames: string[] }>(
      `Continue the series. Return JSON { title, synopsis (2-4 sentences), targetDurationSeconds (1500-2400), characterNames: string[] — subset of recurring cast }. Must stay consistent with the bible and advance the arc. Don't repeat a prior plot.`,
      `SERIES BIBLE (authoritative — respect it):\n${bible}\n\nRECENT EPISODES (immediate predecessors):\n${recent || "(first episode)"}\n\nNEXT EPISODE #${nextNumber}${body.title ? ` — requested title: "${body.title}"` : ""}${body.hint ? `\nHINT: ${body.hint}` : ""}\nLANGUAGE: ${season.series.project.language}`,
      { temperature: 0.85, maxTokens: 800 },
    );

    const ep = await prisma.episode.create({
      data: {
        seasonId: season.id,
        episodeNumber: nextNumber,
        title: body.title || outline.title,
        synopsis: outline.synopsis,
        targetDurationSeconds: outline.targetDurationSeconds ?? 1800,
        status: "REVIEW",
      },
    });

    const appearing = characters.filter((c) => outline.characterNames?.some((n) => n.toLowerCase() === c.name.toLowerCase()));
    if (appearing.length > 0) {
      await prisma.episodeCharacter.createMany({
        data: appearing.map((c) => ({ episodeId: ep.id, characterId: c.id })),
        skipDuplicates: true,
      });
    }

    // 3. Plan all scenes in ONE call (cheaper than N calls)
    const scenesPerEpisode = body.scenesPerEpisode ?? 4;
    const framesPerScene = body.framesPerScene ?? 3;
    const scenesPlan = await groqJson<{ scenes: { title: string; summary: string; scriptText: string; location?: string; mood?: string; characterNames?: string[] }[] }>(
      `Plan ${scenesPerEpisode} scenes. Return JSON { scenes: [{ title, summary, scriptText (4-8 screenplay lines), location, mood, characterNames: string[] }] }. Keep characters consistent with the bible.`,
      `BIBLE:\n${bible}\n\nEPISODE ${nextNumber}: ${outline.title}\n${outline.synopsis}\n\nAvailable cast: ${appearing.map((c) => c.name).join(", ") || "(any)"}`,
      { temperature: 0.8, maxTokens: 2200 },
    ).catch(() => ({ scenes: [] }));

    // 4. Create scenes + frames in parallel (all AI calls concurrent)
    const createdScenes = await Promise.all(
      scenesPlan.scenes.slice(0, scenesPerEpisode).map(async (sp, s) => {
        const scene = await prisma.scene.create({
          data: {
            parentType: "EPISODE", parentId: ep.id, episodeId: ep.id,
            sceneNumber: s + 1, title: sp.title, summary: sp.summary,
            scriptText: sp.scriptText, scriptSource: "AI_GENERATED",
            targetDurationSeconds: 60, status: "STORYBOARD_REVIEW",
            memoryContext: { location: sp.location, mood: sp.mood, characters: sp.characterNames ?? [] } as any,
          },
        });

        const fp = await groqJson<{ frames: { beatSummary: string; imagePrompt: string; negativePrompt?: string }[] }>(
          `Plan ${framesPerScene} storyboard frames. Return JSON { frames: [{ beatSummary, imagePrompt, negativePrompt }] }. Cinematic image prompts.`,
          `Scene: ${sp.title}\nMood: ${sp.mood ?? "—"}\nLocation: ${sp.location ?? "—"}\nCharacters: ${(sp.characterNames ?? []).join(", ") || "—"}\n${sp.scriptText}`,
          { temperature: 0.7, maxTokens: 900 },
        ).catch(() => ({ frames: [] }));

        await prisma.sceneFrame.createMany({
          data: fp.frames.slice(0, framesPerScene).map((fr, fi) => ({
            sceneId: scene.id,
            orderIndex: fi,
            beatSummary: fr.beatSummary,
            imagePrompt: fr.imagePrompt,
            negativePrompt: fr.negativePrompt,
            status: "PENDING",
          })),
          skipDuplicates: true,
        });

        return { sceneId: scene.id, frames: fp.frames.length };
      }),
    );

    return ok({
      episodeId: ep.id,
      title: ep.title,
      episodeNumber: ep.episodeNumber,
      scenes: createdScenes.length,
      frames: createdScenes.reduce((a, s) => a + s.frames, 0),
      characters: appearing.length,
      usedCache: !!contextCache,
    });
  } catch (e) { return handleError(e); }
}
