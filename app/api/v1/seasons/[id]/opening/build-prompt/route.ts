/**
 * POST /api/v1/seasons/[id]/opening/build-prompt
 * Body: { style, styleLabel?, includeCharacters, characterIds, duration, aspectRatio, model }
 * AI builds the final video prompt (6-layer formula + music cue + name cards)
 * and upserts the SeasonOpening row in DRAFT. Returns { openingId, prompt }.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { getContext } from "@/lib/project-context";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 45;

const Body = z.object({
  style: z.string().min(1),
  styleLabel: z.string().optional(),
  includeCharacters: z.boolean().default(true),
  characterIds: z.array(z.string()).default([]),
  duration: z.number().int().min(4).max(12).default(8),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  model: z.enum(["seedance", "kling", "veo3-fast", "veo3-pro"]).default("seedance"),
  customPromptSeed: z.string().optional(),
});

const MODEL_HAS_AUDIO = { seedance: false, kling: false, "veo3-fast": true, "veo3-pro": true } as const;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let stage = "init";
  async function step<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    stage = label;
    try { return await fn(); }
    catch (e) {
      throw Object.assign(new Error(`[${label}] ${(e as Error).message ?? String(e)}`), {
        statusCode: (e as { statusCode?: number }).statusCode ?? 500,
      });
    }
  }

  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = Body.parse(await req.json());

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: { series: { include: { project: true } } },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });
    (await import("@/lib/request-context")).setActiveProject(season.series.projectId);

    const cast = body.includeCharacters && body.characterIds.length > 0
      ? await prisma.character.findMany({
          where: { projectId: season.series.projectId, id: { in: body.characterIds } },
          select: { id: true, name: true, roleType: true, appearance: true, wardrobeRules: true },
        })
      : [];

    const ctxCache = await getContext(season.series.projectId);
    const bible = ctxCache?.summary ?? season.series.project.description ?? "";

    const hasAudio = MODEL_HAS_AUDIO[body.model];
    const audioDirective = hasAudio
      ? `Include diegetic whooshes and a driving musical sting under the title card. Music: ${season.series.project.genreTag ?? "cinematic"}-appropriate. Brief spoken title drop is allowed.`
      : `No narration. The video will be silent — stage the composition so it reads without audio.`;

    const nameCardDirective = body.includeCharacters && cast.length > 0
      ? `Show each cast member in a signature beat, then a name card that reads exactly their name in clean sans-serif over a brief matching color wash: ${cast.map((c) => `"${c.name}"`).join(", ")}.`
      : `No character close-ups — make the intro abstract and typographic around the series title "${season.series.title}".`;

    const castBlock = cast.length > 0
      ? cast.map((c) => `- ${c.name}${c.roleType ? ` (${c.roleType})` : ""}: ${(c.appearance ?? "").slice(0, 140)}${c.wardrobeRules ? ` | wardrobe: ${c.wardrobeRules.slice(0, 80)}` : ""}`).join("\n")
      : "(abstract intro — no specific cast)";

    const prompt = await step("build-prompt", () => groqJson<{ prompt?: string }>(
      `You write cinema-grade video prompts for a TV title sequence. Return JSON { prompt: "..." } with ONE cohesive prompt ready to send to a video model. Follow the 6-layer formula: Subject → Action → Environment → Art Style → Lighting → Technical. ${audioDirective} ${nameCardDirective} MANDATORY: The series title "${season.series.title}" MUST appear as a clean typographic title card — either as the very first shot opening the sequence, or as the final beat closing it. Specify which in the prompt and describe its typography (sans-serif, matching the genre). Keep it ≤ 1200 chars. Positive phrasing only (no "NOT X" negations). Do not mention the model name.`,
      `SERIES BIBLE:\n${bible.slice(0, 1500)}\n\nSERIES TITLE: ${season.series.title}\nSEASON #${season.seasonNumber}${season.title ? ` — ${season.title}` : ""}\nSTYLE CHOICE: ${body.styleLabel ?? body.style}${body.customPromptSeed ? `\nUSER SEED: ${body.customPromptSeed}` : ""}\n\n[CAST to feature]\n${castBlock}\n\nDURATION: ${body.duration}s · ASPECT: ${body.aspectRatio} · MODEL: ${body.model}${hasAudio ? " (has audio)" : " (silent)"}`,
      {
        temperature: 0.8, maxTokens: 1400,
        entityType: "SEASON_OPENING", entityId: season.id,
        description: `Opening · prompt build (${body.model}, ${body.duration}s)`,
        organizationId: ctx.organizationId, projectId: season.series.projectId,
      },
    ));

    const finalPrompt = (prompt?.prompt ?? "").trim();
    if (!finalPrompt) throw Object.assign(new Error("AI returned empty prompt"), { statusCode: 502 });

    const existing = await prisma.seasonOpening.findUnique({ where: { seasonId: season.id } });
    let opening;
    if (existing) {
      // Snapshot the old prompt into version history before overwriting.
      if (existing.currentPrompt && existing.currentPrompt !== finalPrompt) {
        await prisma.seasonOpeningPromptVersion.create({
          data: { openingId: existing.id, prompt: existing.currentPrompt },
        });
      }
      opening = await prisma.seasonOpening.update({
        where: { id: existing.id },
        data: {
          style: body.style,
          styleLabel: body.styleLabel ?? existing.styleLabel,
          includeCharacters: body.includeCharacters,
          characterIds: body.characterIds,
          duration: body.duration,
          aspectRatio: body.aspectRatio,
          model: body.model,
          currentPrompt: finalPrompt,
          status: "DRAFT",
        },
      });
    } else {
      opening = await prisma.seasonOpening.create({
        data: {
          seasonId: season.id,
          style: body.style,
          styleLabel: body.styleLabel,
          includeCharacters: body.includeCharacters,
          characterIds: body.characterIds,
          duration: body.duration,
          aspectRatio: body.aspectRatio,
          model: body.model,
          currentPrompt: finalPrompt,
          status: "DRAFT",
        },
      });
    }

    return ok({ openingId: opening.id, prompt: finalPrompt });
  } catch (e) {
    const err = e as { message?: string; statusCode?: number };
    if (!err.message?.startsWith("[")) err.message = `[${stage}] ${err.message ?? "unknown"}`;
    return handleError(err);
  }
}
