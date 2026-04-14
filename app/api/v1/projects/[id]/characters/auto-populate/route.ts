/**
 * Analyze all episodes/scenes in a project, extract 4-6 recurring MAIN characters,
 * create full appearance + personality prompts for each, and link them to every
 * episode where they appear.
 *
 * Non-destructive: existing characters are preserved. Duplicates (by name, case-insensitive)
 * are skipped. EpisodeCharacter rows use skipDuplicates.
 *
 * Does NOT generate images — those are a separate step (call /generate-gallery per
 * character, or /generate-all-galleries for bulk).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

type AiCharacter = {
  name: string;
  roleType?: string;
  gender?: string;
  ageRange?: string;
  appearance: string;
  personality?: string;
  wardrobeRules?: string;
  speechStyle?: string;
  appearsInEpisodes: number[];
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        series: {
          include: {
            seasons: {
              include: {
                episodes: {
                  orderBy: { episodeNumber: "asc" },
                  include: { scenes: { orderBy: { sceneNumber: "asc" } } },
                },
              },
            },
          },
        },
      },
    });
    if (!project) throw Object.assign(new Error("project not found"), { statusCode: 404 });

    const allEpisodes = project.series.flatMap((s) => s.seasons.flatMap((se) => se.episodes));
    if (allEpisodes.length === 0) throw Object.assign(new Error("no episodes to analyze"), { statusCode: 400 });

    // Build compact episode digest for AI
    const digest = allEpisodes.map((ep) => ({
      n: ep.episodeNumber,
      title: ep.title,
      synopsis: (ep.synopsis ?? "").slice(0, 400),
      scenes: ep.scenes.slice(0, 6).map((sc) => `SC${sc.sceneNumber}: ${sc.title ?? ""} — ${(sc.summary ?? "").slice(0, 220)}`).join("\n"),
    }));
    const digestText = digest.map((e) => `EP${e.n}: ${e.title}\n${e.synopsis}\n${e.scenes}`).join("\n---\n");

    const extracted = await groqJson<{ characters: AiCharacter[] }>(
      `You are a story bible editor. Read all episodes and identify 4-6 RECURRING MAIN characters (appearing in 2+ episodes or central to the story). For EACH, produce a complete identity profile so an image model can render them CONSISTENTLY across all angles:

Return JSON:
{ characters: [{
  name,
  roleType ("protagonist"|"antagonist"|"supporting"|"narrator"|"recurring"),
  gender,
  ageRange,
  appearance   (MUST be visually specific: hair color+style, eye color, build, skin tone, distinguishing features, facial features — 2-3 sentences, ready for image generation),
  personality  (core traits, motivations),
  wardrobeRules (typical outfit/style — for visual continuity),
  speechStyle  (voice/tone tics),
  appearsInEpisodes: [number, ...]   // episode numbers where they appear
}] }

Stick to MAIN characters. Don't invent characters that aren't in the source. Use the exact names used in the episodes.`,
      `Project: ${project.name}\nGenre: ${project.genreTag ?? "—"}\nLanguage: ${project.language}\n\nEPISODES:\n${digestText}`,
      { temperature: 0.3, maxTokens: 3500 },
    );

    // Map existing characters by lowercased name to avoid duplicates
    const existing = await prisma.character.findMany({ where: { projectId: project.id } });
    const existingByName = new Map(existing.map((c) => [c.name.toLowerCase().trim(), c]));

    const created: { id: string; name: string; episodes: number }[] = [];
    const skipped: string[] = [];
    const linked: { character: string; episodes: number[] }[] = [];

    const epByNumber = new Map(allEpisodes.map((e) => [e.episodeNumber, e]));

    for (const c of extracted.characters ?? []) {
      if (!c.name) continue;
      const key = c.name.toLowerCase().trim();
      let character = existingByName.get(key);

      if (!character) {
        character = await prisma.character.create({
          data: {
            projectId: project.id,
            name: c.name.trim(),
            roleType: c.roleType,
            characterType: "HUMAN",
            gender: c.gender,
            ageRange: c.ageRange,
            appearance: c.appearance,
            personality: c.personality,
            wardrobeRules: c.wardrobeRules,
            speechStyle: c.speechStyle,
          },
        });
        existingByName.set(key, character);
      } else {
        skipped.push(character.name);
      }

      // Link to episodes (idempotent — skipDuplicates on the unique constraint)
      const epIds = (c.appearsInEpisodes ?? [])
        .map((n) => epByNumber.get(n)?.id)
        .filter((x): x is string => !!x);

      if (epIds.length > 0) {
        await prisma.episodeCharacter.createMany({
          data: epIds.map((epId) => ({ episodeId: epId, characterId: character!.id })),
          skipDuplicates: true,
        });
      }

      created.push({ id: character.id, name: character.name, episodes: epIds.length });
      linked.push({ character: character.name, episodes: c.appearsInEpisodes ?? [] });
    }

    return ok({
      projectId: project.id,
      projectName: project.name,
      totalCharacters: created.length,
      newlyCreated: created.length - skipped.length,
      skipped,
      linked,
    });
  } catch (e) { return handleError(e); }
}
