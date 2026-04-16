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
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

const Body = z.object({
  preview: z.boolean().optional(),
  // Apply-mode: client sends back the list it received in preview (possibly trimmed/edited)
  characters: z.array(z.object({
    name: z.string(),
    roleType: z.string().optional(),
    gender: z.string().optional(),
    ageRange: z.string().optional(),
    appearance: z.string(),
    personality: z.string().optional(),
    wardrobeRules: z.string().optional(),
    speechStyle: z.string().optional(),
    appearsInEpisodes: z.array(z.number()),
  })).optional(),
}).partial();

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
    (await import("@/lib/request-context")).setActiveProject(params.id);

    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

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

    const existing = await prisma.character.findMany({ where: { projectId: project.id } });
    const existingByName = new Map(existing.map((c) => [c.name.toLowerCase().trim(), c]));
    const epByNumber = new Map(allEpisodes.map((e) => [e.episodeNumber, e]));

    // ----- APPLY MODE: client sent a list back, just persist it -----
    if (body.characters && body.characters.length > 0) {
      const created: { id: string; name: string; episodes: number }[] = [];
      const skipped: string[] = [];
      for (const c of body.characters) {
        const key = c.name.toLowerCase().trim();
        let character = existingByName.get(key);
        if (!character) {
          character = await prisma.character.create({
            data: {
              projectId: project.id,
              name: c.name.trim(),
              roleType: c.roleType, characterType: "HUMAN",
              gender: c.gender, ageRange: c.ageRange,
              appearance: c.appearance, personality: c.personality,
              wardrobeRules: c.wardrobeRules, speechStyle: c.speechStyle,
            },
          });
          existingByName.set(key, character);
        } else {
          skipped.push(character.name);
        }
        // Recurring-role characters (Protagonist/Antagonist/Mentor/Supporting/Friend/Teacher)
        // are auto-linked to EVERY episode in the project, not just ones the AI flagged.
        // The AI sometimes misses recurring cast when a specific episode's script is short.
        const RECURRING_ROLES = new Set(["Protagonist", "Antagonist", "Mentor Figure", "Supporting Character", "Friend", "Teacher"]);
        const epIds = RECURRING_ROLES.has(c.roleType ?? "")
          ? allEpisodes.map((e) => e.id)
          : (c.appearsInEpisodes ?? []).map((n) => epByNumber.get(n)?.id).filter((x): x is string => !!x);
        if (epIds.length > 0) {
          await prisma.episodeCharacter.createMany({
            data: epIds.map((epId) => ({ episodeId: epId, characterId: character!.id })),
            skipDuplicates: true,
          });
        }
        created.push({ id: character.id, name: character.name, episodes: epIds.length });
      }
      return ok({
        projectId: project.id,
        projectName: project.name,
        totalCharacters: created.length,
        newlyCreated: created.length - skipped.length,
        skipped,
        applied: true,
      });
    }

    // ----- PREVIEW MODE (default): extract via AI, return without saving -----
    // Compact digest — cap at 10 most-recent episodes, 3 scene lines each,
    // to keep the prompt small enough that Gemini answers within its 12s window.
    const digest = allEpisodes.slice(-10).map((ep) => ({
      n: ep.episodeNumber,
      title: ep.title,
      synopsis: (ep.synopsis ?? "").slice(0, 260),
      scenes: ep.scenes.slice(0, 3).map((sc) => `SC${sc.sceneNumber}: ${(sc.summary ?? "").slice(0, 140)}`).join("\n"),
    }));
    const digestText = digest.map((e) => `EP${e.n}: ${e.title}\n${e.synopsis}\n${e.scenes}`).join("\n---\n");

    const extracted = await groqJson<{ characters: AiCharacter[] }>(
      `Identify 4-6 RECURRING MAIN characters from the episodes below. Return JSON { characters: [{ name, roleType, gender, ageRange, appearance (2 sentences, visually specific: hair/eyes/build/features — ready for image generation), personality, wardrobeRules, speechStyle, appearsInEpisodes: [number] }] }. Only main characters. Use exact names from the source.`,
      `Project: ${project.name}\nGenre: ${project.genreTag ?? "—"}\nLanguage: ${project.language}\n\nEPISODES:\n${digestText}`,
      { temperature: 0.3, maxTokens: 1800 },
    );

    // Annotate each proposed character with whether it already exists (won't overwrite)
    const proposed = (extracted.characters ?? []).map((c) => ({
      ...c,
      alreadyExists: existingByName.has(c.name.toLowerCase().trim()),
    }));

    return ok({
      projectId: project.id,
      projectName: project.name,
      preview: true,
      characters: proposed,
    });
  } catch (e) { return handleError(e); }
}
