/**
 * POST /api/v1/seasons/[id]/opening/brain-improve
 *
 * "Let the director improve" — called from step 4 of the opening wizard.
 * Reads the current draft prompt + series context, asks Gemini to rewrite
 * it using cinematography knowledge from the brain (characters, series bible,
 * recent episodes). Returns:
 *   {
 *     improvedPrompt: string,      // the new prompt the brain would write
 *     changes:        string[],    // 3-6 bullets describing what changed & why
 *     summary:        string,      // one-sentence pitch of the improvement
 *   }
 *
 * Nothing is persisted here — the wizard shows the proposal to the user and
 * only writes it to the opening if they accept.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { getContext } from "@/lib/project-context";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 75;

const Body = z.object({
  prompt: z.string().min(10).max(6000),
  styleLabel: z.string().optional(),
  model: z.string().optional(),
  duration: z.number().int().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = Body.parse(await req.json());

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: {
        series: { include: { project: true } },
        episodes: { orderBy: { episodeNumber: "desc" }, take: 2, select: { title: true, synopsis: true } },
      },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });

    const ctxCache = await getContext(season.series.projectId);
    const bible = ctxCache?.summary ?? `# ${season.series.project.name}\n${season.series.project.description ?? ""}\nGenre: ${season.series.project.genreTag ?? "—"}`;

    const characters = await prisma.character.findMany({
      where: { projectId: season.series.projectId },
      select: { name: true, roleType: true, appearance: true, personality: true },
      take: 10,
    });
    const castBlock = characters.map((c) => `- ${c.name}${c.roleType ? ` (${c.roleType})` : ""}: ${(c.appearance ?? "").slice(0, 140)} | ${(c.personality ?? "").slice(0, 80)}`).join("\n");

    const recent = season.episodes.map((e) => `• "${e.title}": ${e.synopsis ?? ""}`).join("\n");

    // Pull the brain's own cinematography + capability references so the
    // improvement stays grounded in the house style rather than generic.
    const refs = await prisma.brainReference.findMany({
      where: { kind: { in: ["cinematography", "capability", "sound"] } },
      select: { kind: true, name: true, shortDesc: true, longDesc: true },
      take: 30,
    });
    const refsBlock = refs.map((r) => `[${r.kind}] ${r.name}: ${(r.shortDesc || r.longDesc || "").slice(0, 220)}`).join("\n");

    const system = `You are the AI Director of a TV series. A user has drafted an opening-sequence prompt. Your job is to rewrite it using cinematography knowledge, the series' house style, and the cast identities — then explain what you changed and why.

Rules:
- Preserve the user's core intent (mood, scene structure, duration, style category). Don't invent a totally different opening.
- Strengthen: camera work, lens choice (35mm/50mm/anamorphic), lighting (key/fill/practicals), color palette, edit rhythm, audio cues, actor direction.
- Hard constraint: every visual MUST be live-action photorealistic with real human actors. NO animation / cartoon / 3D / CGI / painted.
- Reference characters by the exact names from the cast block when relevant.
- Keep the length similar to the input (±30%). The target model is ${body.model ?? "sora-2"} for ${body.duration ?? 20}s.
- Avoid Sora moderation triggers: no surveillance / conspiracy / menacing / weapons / children / politically-charged names.

Output JSON only:
{
  "improvedPrompt": "the full rewritten prompt, single flowing paragraph",
  "changes": ["what/why bullet 1 (max 20 words)", "bullet 2", ..., "bullet 6"],
  "summary": "one-sentence pitch of the improvement in Hebrew"
}`;

    const user = `SERIES BIBLE:
${bible}

CAST (for identity lock):
${castBlock || "(none yet)"}

RECENT EPISODES:
${recent || "(none)"}

HOUSE-STYLE REFERENCES (brain memory):
${refsBlock || "(none)"}

STYLE CATEGORY: ${body.styleLabel ?? "(custom)"}
TARGET MODEL: ${body.model ?? "sora-2"} · ${body.duration ?? 20}s

CURRENT DRAFT PROMPT:
${body.prompt}

Rewrite it as a director would brief a DP.`;

    const result = await groqJson<{ improvedPrompt?: string; changes?: string[]; summary?: string }>(
      system,
      user,
      {
        temperature: 0.6,
        maxTokens: 3000,
        entityType: "SEASON_OPENING",
        entityId: season.id,
        description: "Opening · brain-improve",
        organizationId: ctx.organizationId,
        projectId: season.series.projectId,
      },
    );

    const improved = result?.improvedPrompt?.trim();
    if (!improved || improved.length < 40) {
      throw Object.assign(new Error("AI returned an empty improvement"), { statusCode: 502 });
    }
    const changes = Array.isArray(result?.changes) ? result.changes.filter((c): c is string => typeof c === "string").slice(0, 8) : [];
    const summary = typeof result?.summary === "string" ? result.summary.slice(0, 280) : "";

    return ok({
      improvedPrompt: improved,
      changes,
      summary,
      originalLength: body.prompt.length,
      improvedLength: improved.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
