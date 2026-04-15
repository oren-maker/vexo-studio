/**
 * GET /api/v1/characters/[id]/participation
 * Returns the episodes + scenes where this character appears, grouped by
 * season. Scenes are resolved via:
 *   - EpisodeCharacter link → episodes where the character is cast
 *   - Scene.memoryContext.characters array → scenes that explicitly list
 *     the character by name
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;

    const character = await prisma.character.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      select: { id: true, name: true, projectId: true },
    });
    if (!character) throw Object.assign(new Error("character not found"), { statusCode: 404 });

    const normalize = (s: string) => s.toLowerCase().trim();
    const charNameNorm = normalize(character.name);

    // Episodes: via EpisodeCharacter link
    const episodeLinks = await prisma.episodeCharacter.findMany({
      where: { characterId: character.id },
      include: {
        episode: {
          select: {
            id: true, episodeNumber: true, title: true, synopsis: true, status: true,
            season: { select: { id: true, seasonNumber: true, title: true } },
            scenes: {
              orderBy: { sceneNumber: "asc" },
              select: { id: true, sceneNumber: true, title: true, summary: true, memoryContext: true },
            },
          },
        },
      },
    });

    // Also find scenes that mention the character by name in memoryContext
    // but whose episode isn't formally linked (catches scripts where the
    // character appears before they were added to the cast).
    const allScenesWithContext = await prisma.scene.findMany({
      where: {
        episode: { season: { series: { projectId: character.projectId } } },
        memoryContext: { not: null as unknown as object },
      },
      select: {
        id: true, sceneNumber: true, title: true, summary: true,
        episode: { select: { id: true, episodeNumber: true, title: true, season: { select: { id: true, seasonNumber: true, title: true } } } },
        memoryContext: true,
      },
    });
    const extraScenes = allScenesWithContext.filter((s) => {
      const names = (s.memoryContext as { characters?: string[] } | null)?.characters ?? [];
      return names.some((n) => normalize(n) === charNameNorm);
    });

    // Build the response grouped by season → episode → scenes
    type SceneRow = { id: string; sceneNumber: number; title: string | null; summary: string | null };
    type EpisodeRow = { id: string; episodeNumber: number; title: string; synopsis: string | null; status: string; scenesWithChar: SceneRow[]; totalScenes: number };
    type SeasonRow = { id: string; seasonNumber: number; title: string | null; episodes: EpisodeRow[] };

    const bySeasonEpisode = new Map<string, SeasonRow>();

    const addEp = (seasonInfo: { id: string; seasonNumber: number; title: string | null }, episode: { id: string; episodeNumber: number; title: string; synopsis: string | null; status: string }) => {
      if (!bySeasonEpisode.has(seasonInfo.id)) {
        bySeasonEpisode.set(seasonInfo.id, { ...seasonInfo, episodes: [] });
      }
      const s = bySeasonEpisode.get(seasonInfo.id)!;
      if (!s.episodes.find((e) => e.id === episode.id)) {
        s.episodes.push({ ...episode, scenesWithChar: [], totalScenes: 0 });
      }
      return s.episodes.find((e) => e.id === episode.id)!;
    };

    for (const link of episodeLinks) {
      const ep = link.episode;
      const epRow = addEp(ep.season, { id: ep.id, episodeNumber: ep.episodeNumber, title: ep.title, synopsis: ep.synopsis, status: ep.status });
      epRow.totalScenes = ep.scenes.length;
      for (const sc of ep.scenes) {
        const names = (sc.memoryContext as { characters?: string[] } | null)?.characters ?? [];
        const inThisScene = names.some((n) => normalize(n) === charNameNorm);
        if (inThisScene) {
          epRow.scenesWithChar.push({ id: sc.id, sceneNumber: sc.sceneNumber, title: sc.title, summary: sc.summary });
        }
      }
    }
    for (const sc of extraScenes) {
      const ep = sc.episode;
      if (!ep) continue;
      const epRow = addEp(ep.season, { id: ep.id, episodeNumber: ep.episodeNumber, title: ep.title, synopsis: null, status: "" });
      if (!epRow.scenesWithChar.find((s) => s.id === sc.id)) {
        epRow.scenesWithChar.push({ id: sc.id, sceneNumber: sc.sceneNumber, title: sc.title, summary: sc.summary });
      }
    }

    const seasons = Array.from(bySeasonEpisode.values()).sort((a, b) => a.seasonNumber - b.seasonNumber);
    for (const s of seasons) s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

    const totalEpisodes = seasons.reduce((a, s) => a + s.episodes.length, 0);
    const totalScenes = seasons.reduce((a, s) => a + s.episodes.reduce((b, e) => b + e.scenesWithChar.length, 0), 0);
    return ok({ character: { id: character.id, name: character.name }, seasons, totalEpisodes, totalScenes });
  } catch (e) { return handleError(e); }
}
