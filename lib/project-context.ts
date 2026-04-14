/**
 * Series "memory cache". A compact JSON bible per project, refreshed on a
 * 5-minute interval by cron. All AI generators read this first so they don't
 * re-summarize the whole series every call.
 */
import { prisma } from "./prisma";
import { groqJson } from "./groq";

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ContextData {
  premise: string;
  tone: string;
  themes: string[];
  characters: { name: string; roleType?: string | null; appearance?: string | null; arc?: string }[];
  episodes: { n: number; title: string; status: string; oneLine: string }[];
  seasonArcs: { season: number; arc: string }[];
  lastEpisodeBeats: { n: number; beats: string[] }[];
  buildStats: { episodes: number; scenes: number; characters: number };
}

export async function isStale(projectId: string): Promise<boolean> {
  const c = await prisma.projectContext.findUnique({ where: { projectId } });
  if (!c) return true;
  return Date.now() - c.updatedAt.getTime() > CACHE_TTL_MS;
}

export async function getContext(projectId: string) {
  return prisma.projectContext.findUnique({ where: { projectId } });
}

export async function buildContext(projectId: string) {
  // Lean fetch — only the fields we actually feed to the model.
  const [project, sceneCountRow] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, name: true, language: true, description: true, genreTag: true,
        characters: { select: { name: true, roleType: true, appearance: true } },
        series: {
          select: {
            seasons: {
              orderBy: { seasonNumber: "asc" },
              select: {
                seasonNumber: true, description: true,
                episodes: {
                  orderBy: { episodeNumber: "asc" },
                  select: { id: true, episodeNumber: true, title: true, synopsis: true, status: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.scene.count({ where: { episode: { season: { series: { projectId } } } } }),
  ]);
  if (!project) throw new Error("project not found");

  const allEpisodes = project.series.flatMap((s) => s.seasons.flatMap((se) => se.episodes));
  const sceneCount = sceneCountRow;

  // Only the last 2 episodes need scene samples
  const lastEpisodeIds = allEpisodes.slice(-2).map((e) => e.id);
  const sampleScenes = lastEpisodeIds.length > 0 ? await prisma.scene.findMany({
    where: { episodeId: { in: lastEpisodeIds } },
    orderBy: [{ episodeId: "asc" }, { sceneNumber: "asc" }],
    take: 6,
    select: { episodeId: true, sceneNumber: true, summary: true },
  }) : [];

  const epDigest = allEpisodes.slice(0, 20).map((e) => `EP${e.episodeNumber}: ${e.title} [${e.status}] — ${(e.synopsis ?? "").slice(0, 220)}`).join("\n");
  const charDigest = project.characters.map((c) => `- ${c.name} (${c.roleType ?? "—"}): ${(c.appearance ?? "").slice(0, 160)}`).join("\n") || "(none yet)";
  const epNumberById = new Map(allEpisodes.map((e) => [e.id, e.episodeNumber]));
  const sceneSample = sampleScenes.map((s) => `EP${epNumberById.get(s.episodeId!) ?? "?"}·SC${s.sceneNumber}: ${(s.summary ?? "").slice(0, 120)}`).join("\n");

  let ai: ContextData;
  try {
    ai = await groqJson<ContextData>(
      `You are maintaining a series bible. Return JSON with keys { premise, tone, themes: [], characters: [{ name, roleType, appearance, arc }], episodes: [{ n, title, status, oneLine }], seasonArcs: [{ season, arc }], lastEpisodeBeats: [{ n, beats: [] }], buildStats: { episodes, scenes, characters } }. Be TIGHT — under 3000 chars total.`,
      `Project: ${project.name}\nLanguage: ${project.language}\nGenre: ${project.genreTag ?? "—"}\nPremise (user-provided): ${project.description ?? "(none)"}\n\nEPISODES:\n${epDigest || "(none yet)"}\n\nCHARACTERS:\n${charDigest}\n\nRECENT SCENES:\n${sceneSample || "(none)"}`,
      { temperature: 0.3, maxTokens: 1600 },
    );
  } catch {
    // Soft fallback: build a mechanical summary so the cache always exists
    ai = {
      premise: project.description ?? "",
      tone: project.genreTag ?? "",
      themes: [],
      characters: project.characters.map((c) => ({ name: c.name, roleType: c.roleType, appearance: c.appearance, arc: "" })),
      episodes: allEpisodes.map((e) => ({ n: e.episodeNumber, title: e.title, status: e.status, oneLine: (e.synopsis ?? "").slice(0, 180) })),
      seasonArcs: project.series.flatMap((s) => s.seasons.map((se) => ({ season: se.seasonNumber, arc: se.description ?? "" }))),
      lastEpisodeBeats: [],
      buildStats: { episodes: allEpisodes.length, scenes: sceneCount, characters: project.characters.length },
    };
  }

  ai.buildStats = { episodes: allEpisodes.length, scenes: sceneCount, characters: project.characters.length };

  const summary = [
    `# ${project.name}`,
    ai.premise ? `**Premise:** ${ai.premise}` : "",
    ai.tone ? `**Tone:** ${ai.tone}` : "",
    ai.themes?.length ? `**Themes:** ${ai.themes.join(", ")}` : "",
    ai.characters?.length ? `\n## Characters\n${ai.characters.map((c) => `- **${c.name}** (${c.roleType ?? "—"}): ${c.appearance ?? ""} ${c.arc ? `· arc: ${c.arc}` : ""}`).join("\n")}` : "",
    ai.episodes?.length ? `\n## Episodes\n${ai.episodes.map((e) => `- EP${e.n} **${e.title}** [${e.status}]: ${e.oneLine}`).join("\n")}` : "",
    ai.seasonArcs?.length ? `\n## Season arcs\n${ai.seasonArcs.map((s) => `- S${s.season}: ${s.arc}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const tokenCount = Math.ceil(summary.length / 4);

  const saved = await prisma.projectContext.upsert({
    where: { projectId },
    create: { projectId, summary, data: ai as any, tokenCount },
    update: { summary, data: ai as any, tokenCount },
  });

  await prisma.aILog.create({
    data: {
      projectId,
      actorType: "DIRECTOR",
      actionType: "CONTEXT_REFRESH",
      input: { trigger: "manual-or-cron" } as any,
      output: { tokenCount, episodes: ai.buildStats.episodes, characters: ai.buildStats.characters } as any,
      decisionReason: `Context refreshed: ${ai.buildStats.episodes} eps · ${ai.buildStats.scenes} scenes · ${ai.buildStats.characters} chars`,
    },
  }).catch(() => {});

  return saved;
}

export async function ensureFreshContext(projectId: string) {
  if (await isStale(projectId)) return buildContext(projectId);
  return getContext(projectId);
}
