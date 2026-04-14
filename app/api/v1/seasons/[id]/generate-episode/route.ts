/**
 * Generate ONE new episode for the season, using all prior episodes + characters
 * as context so the new episode stays coherent with the arc.
 * Creates: episode + scenes + frame storyboard + EpisodeCharacter appearances.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertEpisodeQuota } from "@/lib/plan-limits";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  title: z.string().optional(),
  hint: z.string().optional(),
  scenesPerEpisode: z.number().int().min(2).max(8).default(4),
  framesPerScene: z.number().int().min(2).max(6).default(4),
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
        episodes: { orderBy: { episodeNumber: "asc" }, include: { scenes: { orderBy: { sceneNumber: "asc" } } } },
      },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });
    await assertEpisodeQuota(ctx.organizationId, season.seriesId);

    const characters = await prisma.character.findMany({ where: { projectId: season.series.projectId } });

    const priorEpisodes = season.episodes.map((e) => ({
      n: e.episodeNumber,
      title: e.title,
      synopsis: e.synopsis ?? "",
      beats: e.scenes.map((s) => `  ${s.sceneNumber}. ${s.title ?? ""} — ${(s.summary ?? "").slice(0, 180)}`).join("\n"),
    }));
    const priorText = priorEpisodes.length === 0
      ? "(none yet — this is the first episode)"
      : priorEpisodes.map((e) => `EP${e.n}: ${e.title}\n${e.synopsis}\nScenes:\n${e.beats}`).join("\n\n");

    const charsText = characters.length === 0
      ? "(no recurring characters defined)"
      : characters.map((c) => `- ${c.name} [${c.roleType ?? "—"}]: ${c.appearance ?? ""} | ${c.personality ?? ""}`).join("\n");

    const nextNumber = (season.episodes.at(-1)?.episodeNumber ?? 0) + 1;

    // 1. Outline the new episode
    const outline = await groqJson<{ title: string; synopsis: string; targetDurationSeconds: number; characterNames: string[] }>(
      `Write ONE new episode that continues the season. Return JSON { title, synopsis (2-4 sentences, 80-180 words), targetDurationSeconds (1500-2400), characterNames: string[] — subset of the project's characters that appear }. Be consistent with tone/world/arc. Don't repeat a prior plot.`,
      `PROJECT: ${season.series.project.name}\nGENRE: ${season.series.project.genreTag ?? "—"}\nLANGUAGE: ${season.series.project.language}\nSERIES: ${season.series.title}\nSEASON ${season.seasonNumber}${season.title ? `: ${season.title}` : ""}\n\nRECURRING CHARACTERS:\n${charsText}\n\nPRIOR EPISODES (context):\n${priorText}\n\nNEXT EPISODE #${nextNumber}${body.title ? ` — requested title: "${body.title}"` : ""}${body.hint ? `\nHINT: ${body.hint}` : ""}`,
      { temperature: 0.85, maxTokens: 1200 },
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

    // Link characters that appear
    const scenesPerEpisode = body.scenesPerEpisode ?? 4;
    const framesPerScene = body.framesPerScene ?? 4;
    const appearing = characters.filter((c) => outline.characterNames?.some((n) => n.toLowerCase() === c.name.toLowerCase()));
    if (appearing.length > 0) {
      await prisma.episodeCharacter.createMany({
        data: appearing.map((c) => ({ episodeId: ep.id, characterId: c.id })),
        skipDuplicates: true,
      });
    }

    // 2. Plan scenes with character continuity
    const scenesPlan = await groqJson<{ scenes: { title: string; summary: string; scriptText: string; location?: string; mood?: string; characterNames?: string[] }[] }>(
      `Plan ${scenesPerEpisode} scenes. Return JSON { scenes: [{ title, summary, scriptText (4-8 lines, natural screenplay), location, mood, characterNames: string[] }] }. Keep character appearances consistent with the recurring cast.`,
      `Episode #${nextNumber}: ${outline.title}\nSynopsis: ${outline.synopsis}\n\nRecurring characters available: ${appearing.map((c) => c.name).join(", ") || "(none)"}`,
      { temperature: 0.85, maxTokens: 2500 },
    ).catch(() => ({ scenes: [] }));

    let frameCount = 0;
    for (let s = 0; s < Math.min(scenesPlan.scenes.length, scenesPerEpisode); s++) {
      const sp = scenesPlan.scenes[s];
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
        `Plan ${framesPerScene} storyboard frames. Return JSON { frames: [{ beatSummary, imagePrompt, negativePrompt }] }. Image prompts cinematic & ready for image generation.`,
        `Scene: ${sp.title}\nMood: ${sp.mood ?? "—"}\nLocation: ${sp.location ?? "—"}\nCharacters: ${(sp.characterNames ?? []).join(", ") || "—"}\n${sp.scriptText}`,
        { temperature: 0.7, maxTokens: 1500 },
      ).catch(() => ({ frames: [] }));

      for (let fi = 0; fi < Math.min(fp.frames.length, framesPerScene); fi++) {
        const fr = fp.frames[fi];
        await prisma.sceneFrame.create({
          data: { sceneId: scene.id, orderIndex: fi, beatSummary: fr.beatSummary, imagePrompt: fr.imagePrompt, negativePrompt: fr.negativePrompt, status: "PENDING" },
        });
        frameCount++;
      }
    }

    return ok({ episodeId: ep.id, title: ep.title, episodeNumber: ep.episodeNumber, scenes: scenesPlan.scenes.length, frames: frameCount, characters: appearing.length });
  } catch (e) { return handleError(e); }
}
