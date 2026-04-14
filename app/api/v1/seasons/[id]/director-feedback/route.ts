import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_ai_director"); if (f) return f;
    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: { episodes: { orderBy: { episodeNumber: "asc" }, select: { id: true, episodeNumber: true, title: true, synopsis: true, status: true } }, series: true },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });

    const epSummary = season.episodes.map((e) => `EP${e.episodeNumber}: ${e.title} [${e.status}] — ${e.synopsis ?? ""}`).join("\n");

    const j = await groqJson<{ overall: string; arc: string; pacing: string; strengths: string[]; concerns: string[]; suggestions: string[] }>(
      "You are a veteran TV showrunner giving notes on an entire season arc. Return JSON: { overall, arc, pacing, strengths: [], concerns: [], suggestions: [] }",
      `Series: ${season.series.title}\nSeason ${season.seasonNumber}${season.title ? `: ${season.title}` : ""}\n\nEpisodes:\n${epSummary}`,
      { temperature: 0.6, maxTokens: 1500 },
    );

    return ok(j);
  } catch (e) { return handleError(e); }
}
