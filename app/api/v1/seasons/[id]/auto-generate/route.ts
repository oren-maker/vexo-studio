/**
 * Auto-generate a full season: episodes + scenes + scripts + frames + SEO.
 * Episodes count from body (default 5). Heavy — runs serial Gemini calls; protect with maxDuration=60s.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  episodes: z.number().int().min(1).max(10).default(5),
  scenesPerEpisode: z.number().int().min(2).max(8).default(4),
  framesPerScene: z.number().int().min(2).max(6).default(4),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: { series: { include: { project: true } }, episodes: { orderBy: { episodeNumber: "desc" }, take: 1 } },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });

    // Outline season episodes
    const startNum = (season.episodes[0]?.episodeNumber ?? 0) + 1;
    const outline = await groqJson<{ episodes: { title: string; synopsis: string; targetDurationSeconds: number }[] }>(
      `Outline ${body.episodes} consecutive episodes. Return JSON { episodes: [{ title, synopsis, targetDurationSeconds }] }. Each episode 25-40 min.`,
      `Project: ${season.series.project.name}\nGenre: ${season.series.project.genreTag ?? "—"}\nSeries: ${season.series.title}\nSeason ${season.seasonNumber}${season.title ? `: ${season.title}` : ""}\nLanguage: ${season.series.project.language}`,
      { temperature: 0.85, maxTokens: 2000 },
    );

    const created: { episodeId: string; title: string; scenes: number; frames: number }[] = [];

    for (let i = 0; i < Math.min(outline.episodes.length, body.episodes); i++) {
      const e = outline.episodes[i];
      const ep = await prisma.episode.create({
        data: {
          seasonId: season.id,
          episodeNumber: startNum + i,
          title: e.title,
          synopsis: e.synopsis,
          targetDurationSeconds: e.targetDurationSeconds ?? 1800,
          status: "REVIEW",
        },
      });

      // Generate scenes for this episode
      const scenesPlan = await groqJson<{ scenes: { title: string; summary: string; scriptText: string; location?: string; mood?: string }[] }>(
        `Plan ${body.scenesPerEpisode} scenes. Return JSON { scenes: [{ title, summary, scriptText (4-8 lines), location, mood }] }`,
        `Episode #${startNum + i}: ${e.title}\nSynopsis: ${e.synopsis}`,
        { temperature: 0.85, maxTokens: 2500 },
      ).catch(() => ({ scenes: [] }));

      let frameCount = 0;
      for (let s = 0; s < Math.min(scenesPlan.scenes.length, body.scenesPerEpisode); s++) {
        const sp = scenesPlan.scenes[s];
        const scene = await prisma.scene.create({
          data: {
            parentType: "EPISODE", parentId: ep.id, episodeId: ep.id,
            sceneNumber: s + 1, title: sp.title, summary: sp.summary,
            scriptText: sp.scriptText, scriptSource: "AI_GENERATED",
            targetDurationSeconds: 60, status: "STORYBOARD_REVIEW",
            memoryContext: { location: sp.location, mood: sp.mood } as any,
          },
        });

        const fp = await groqJson<{ frames: { beatSummary: string; imagePrompt: string; negativePrompt?: string }[] }>(
          `Plan ${body.framesPerScene} storyboard frames. Return JSON { frames: [{ beatSummary, imagePrompt, negativePrompt }] }. Image prompts: cinematic, ready for image generation.`,
          `Scene: ${sp.title}\nMood: ${sp.mood ?? "—"}\nLocation: ${sp.location ?? "—"}\n${sp.scriptText}`,
          { temperature: 0.7, maxTokens: 1500 },
        ).catch(() => ({ frames: [] }));

        for (let fi = 0; fi < Math.min(fp.frames.length, body.framesPerScene); fi++) {
          const fr = fp.frames[fi];
          await prisma.sceneFrame.create({
            data: { sceneId: scene.id, orderIndex: fi, beatSummary: fr.beatSummary, imagePrompt: fr.imagePrompt, negativePrompt: fr.negativePrompt, status: "PENDING" },
          });
          frameCount++;
        }
      }

      created.push({ episodeId: ep.id, title: ep.title, scenes: scenesPlan.scenes.length, frames: frameCount });
    }

    return ok({ created, season: { id: season.id, episodesAdded: created.length } });
  } catch (e) { return handleError(e); }
}
