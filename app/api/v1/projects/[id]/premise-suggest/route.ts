/**
 * AI Director: propose a series premise (2-4 sentences, under 300 chars)
 * based on the current episodes/seasons in this project. Does NOT save —
 * just returns { premise } for the user to confirm.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        series: { include: { seasons: { include: { episodes: { orderBy: { episodeNumber: "asc" }, take: 10 } } } } },
      },
    });
    if (!project) throw Object.assign(new Error("project not found"), { statusCode: 404 });

    const eps = project.series.flatMap((s) => s.seasons.flatMap((se) => se.episodes));
    const digest = eps.slice(0, 10).map((e) => `EP${e.episodeNumber}: ${e.title}\n${(e.synopsis ?? "").slice(0, 300)}`).join("\n\n");

    const r = await groqJson<{ premise: string }>(
      `Write a series premise — 2-4 short sentences, under 300 characters, that captures the show's core story, tone, and what makes it distinctive. Language: ${project.language}. Return JSON { premise }.`,
      `Series: ${project.name}\nGenre: ${project.genreTag ?? "—"}\nExisting description: ${project.description ?? "(none yet)"}\n\nEpisodes so far:\n${digest || "(no episodes yet — extrapolate from name+genre)"}`,
      { temperature: 0.7, maxTokens: 400 },
    );
    return ok({ premise: r.premise });
  } catch (e) { return handleError(e); }
}
