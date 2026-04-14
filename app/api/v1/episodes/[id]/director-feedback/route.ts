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
    const ep = await prisma.episode.findFirst({
      where: { id: params.id, season: { series: { project: { organizationId: ctx.organizationId } } } },
      include: { scenes: { orderBy: { sceneNumber: "asc" }, select: { sceneNumber: true, title: true, summary: true, scriptText: true, status: true } } },
    });
    if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });

    const sceneSummary = ep.scenes.map((s) => `Scene ${s.sceneNumber}${s.title ? ` (${s.title})` : ""} [${s.status}]\n${s.summary ?? ""}\n${s.scriptText?.slice(0, 600) ?? ""}`).join("\n\n");

    const j = await groqJson<{ overall: string; strengths: string[]; concerns: string[]; suggestions: string[]; sceneNotes: { sceneNumber: number; note: string }[] }>(
      "You are a veteran TV showrunner giving director-level notes on the entire episode script. Return JSON: { overall: <2 sentences>, strengths: [3 bullets], concerns: [3 bullets], suggestions: [3 actionable bullets], sceneNotes: [{ sceneNumber, note: 1 sentence }] }",
      `Episode #${ep.episodeNumber}: ${ep.title}\nSynopsis: ${ep.synopsis ?? "—"}\n\nScenes:\n${sceneSummary}`,
      { temperature: 0.6, maxTokens: 1500 },
    );

    // Persist as critic review for history
    await prisma.aICriticReview.create({
      data: {
        entityType: "EPISODE", entityId: ep.id, episodeId: ep.id,
        contentType: "DIRECTOR_FEEDBACK", score: 0.7,
        feedback: j.overall, issuesDetected: j.concerns as any, suggestions: j.suggestions as any,
      },
    });

    return ok(j);
  } catch (e) { return handleError(e); }
}
