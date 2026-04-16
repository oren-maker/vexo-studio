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
  duration: z.number().int().min(4).max(120).default(20),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  model: z.enum([
    "seedance", "kling", "veo3-fast", "veo3-pro",
    "google-veo-3.1-fast-generate-preview", "google-veo-3.1-generate-preview", "google-veo-3.1-lite-generate-preview",
    "sora-2",
    "vidu-q1",
  ]).default("seedance"),
  customPromptSeed: z.string().optional(),
});

const MODEL_HAS_AUDIO: Record<string, boolean> = {
  seedance: false, kling: false,
  "veo3-fast": true, "veo3-pro": true,
  "google-veo-3.1-fast-generate-preview": true,
  "google-veo-3.1-generate-preview": true,
  "google-veo-3.1-lite-generate-preview": true,
  "sora-2": true,
  "sora-2-pro": true,
  "vidu-q1": true,
};

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
    // MANDATORY music + sparse narration. Previous builds only had narration
    // over the title drop with no background music. This must be continuous.
    const audioDirective = hasAudio
      ? `MANDATORY CONTINUOUS BACKGROUND MUSIC for the ENTIRE duration — a driving, cinematic ${season.series.project.genreTag ?? "cinematic"}-appropriate score with a clear melody, rhythm, and rising arc. Music starts at second 0 and never stops. Layer in diegetic whooshes as each name card hits. A single brief narrator voice reads the series title ONLY at the title card — no other narration.`
      : `No narration or music — silent video. Stage the composition so it reads without any audio.`;

    // Pacing math: reserve ~1s for the title card, divide the rest evenly across characters.
    // Each name card must hold ≥1.5 seconds to be readable.
    const titleCardSeconds = 1.5;
    const perCharacter = cast.length > 0 ? (body.duration - titleCardSeconds) / cast.length : 0;
    const tooFast = perCharacter > 0 && perCharacter < 1.5;
    const pacingDirective = cast.length > 0 ? (
      tooFast
        ? `CRITICAL PACING: duration is ${body.duration}s with ${cast.length} characters — that's only ${perCharacter.toFixed(1)}s per character which is TOO FAST to read. Instead group the characters: show them in 2-3 shots (pairs or the whole ensemble) with ONE shared name-card beat per group that lists multiple names. Each text beat holds for ≥1.5 seconds.`
        : `PACING: allocate ~${perCharacter.toFixed(1)}s per character shot + name card. Every name card MUST hold on screen for AT LEAST 1.5 seconds — crystal readable, not a flash. No rapid-cut montage where names blur.`
    ) : "";

    const nameCardDirective = body.includeCharacters && cast.length > 0
      ? `Show EVERY ONE of these ${cast.length} cast members (non-negotiable — none may be dropped): ${cast.map((c) => `"${c.name}"`).join(", ")}. Each gets a signature hero shot followed (or overlaid) by a LARGE, crystal-clear sans-serif name card spelling their name EXACTLY as written here. Name card stays on screen ≥1.5 seconds.${hasAudio ? ` AUDIO NARRATION: a warm, confident announcer voice reads each character's name out loud as their card appears, synced to the on-screen text. Sequence of spoken names in order of appearance: ${cast.map((c) => `"${c.name}"`).join(" … ")}. After all names, the narrator reads the series title "${season.series.title}" on the final title card. Clear, intelligible English (or the series language) pronunciation.` : ""}`
      : `No character close-ups — make the intro abstract and typographic around the series title "${season.series.title}".${hasAudio ? ` The narrator reads the series title "${season.series.title}" once, clearly, at the title card.` : ""}`;

    const castBlock = cast.length > 0
      ? cast.map((c) => `- ${c.name}${c.roleType ? ` (${c.roleType})` : ""}: ${(c.appearance ?? "").slice(0, 140)}${c.wardrobeRules ? ` | wardrobe: ${c.wardrobeRules.slice(0, 80)}` : ""}`).join("\n")
      : "(abstract intro — no specific cast)";

    const prompt = await step("build-prompt", () => groqJson<{ prompt?: string }>(
      `You write cinema-grade video prompts for a TV title sequence. Return JSON { prompt: "..." } with ONE cohesive prompt ready to send to a video model. Follow the 6-layer formula: Subject → Action → Environment → Art Style → Lighting → Technical.

HARD STYLE LOCK (non-negotiable): the generated prompt MUST describe a LIVE-ACTION PHOTOREALISTIC production with REAL HUMAN ACTORS — real skin pores, real eyes, natural hair, natural wardrobe, shot on a real cinema camera with real physical lighting and authentic film grain. Bake this in using positive phrasing throughout the Art Style + Technical layers. Never describe it as animated, cartoon, anime, illustrated, painted, 3D-rendered, CGI, stylized, or digital art.
${body.model.startsWith("sora") ? "IMPORTANT — target is OpenAI Sora: (1) keep language neutral and descriptive. AVOID words that trigger moderation filters (paranoid, drugs, tattoos, blood, violence, sexual, surveillance, suspicious, threatening, dark psychological, thriller, noir-dark, crime, espionage). Use positive descriptive language instead (a thoughtful protagonist, a quiet scientist, a focused investigator). (2) Sora can lock ONE face via the starting image but cannot multi-reference. For every OTHER character include a rich physical description in the prompt itself (hair color and length, skin tone, build, signature wardrobe) so Sora can render them consistently from text alone." : ""}

${audioDirective}

${nameCardDirective}

${pacingDirective}

MANDATORY: The series title "${season.series.title}" MUST appear as a clean typographic title card with LARGE readable letters — either as the very first shot opening the sequence, or as the final beat closing it. The title text MUST be fully visible with SAFE margins (at least 15% padding on every edge of the frame — no clipping, no edge crop, no letters touching the borders). Center the title horizontally and vertically. Describe its typography (sans-serif, matching the genre).

Keep it ≤ 1400 chars. Positive phrasing only (no "NOT X" negations). Do not mention the model name. Do not reduce the cast count under any circumstances.`,
      `SERIES BIBLE:\n${bible.slice(0, 1500)}\n\nSERIES TITLE: ${season.series.title}\nSEASON #${season.seasonNumber}${season.title ? ` — ${season.title}` : ""}\nSTYLE CHOICE: ${body.styleLabel ?? body.style}${body.customPromptSeed ? `\nUSER SEED: ${body.customPromptSeed}` : ""}\n\n[CAST to feature — ALL ${cast.length} must appear]\n${castBlock}\n\nDURATION: ${body.duration}s · ASPECT: ${body.aspectRatio} · MODEL: ${body.model}${hasAudio ? " (has audio — music is MANDATORY)" : " (silent)"}`,
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
      // Keep status=GENERATING if a Sora/VEO job is already in-flight — the
      // webhook/poll will flip it to READY once the in-flight clip finishes.
      // Otherwise reset to DRAFT so the user can trigger a fresh generate.
      const isJobInFlight = existing.status === "GENERATING" && !!existing.falRequestId;
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
          status: isJobInFlight ? "GENERATING" : "DRAFT",
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
