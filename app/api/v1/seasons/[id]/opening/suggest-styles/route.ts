/**
 * POST /api/v1/seasons/[id]/opening/suggest-styles
 * AI proposes 4 distinct visual styles for a season intro, grounded in the
 * series bible + cast + most recent episode(s). Returns:
 *   { styles: [{ key, name, vibe, samplePrompt }] }
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { getContext } from "@/lib/project-context";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 45;

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

    const season = await prisma.season.findFirst({
      where: { id: params.id, series: { project: { organizationId: ctx.organizationId } } },
      include: {
        series: { include: { project: true } },
        episodes: { orderBy: { episodeNumber: "desc" }, take: 2, select: { title: true, synopsis: true } },
      },
    });
    if (!season) throw Object.assign(new Error("season not found"), { statusCode: 404 });
    (await import("@/lib/request-context")).setActiveProject(season.series.projectId);

    const ctxCache = await getContext(season.series.projectId);
    const bible = ctxCache?.summary ?? [
      `# ${season.series.project.name}`,
      season.series.project.description ?? "",
      `Genre: ${season.series.project.genreTag ?? "—"}`,
      `Language: ${season.series.project.language}`,
    ].filter(Boolean).join("\n");

    const characters = await prisma.character.findMany({
      where: { projectId: season.series.projectId },
      select: { name: true, roleType: true, appearance: true },
      take: 10,
    });
    const castBlock = characters.map((c) => `- ${c.name}${c.roleType ? ` (${c.roleType})` : ""}: ${(c.appearance ?? "").slice(0, 120)}`).join("\n");

    const recent = season.episodes.map((e) => `• "${e.title}": ${e.synopsis ?? ""}`).join("\n");

    const result = await step("suggest-styles", () => groqJson<{ styles?: { key?: string; name?: string; vibe?: string; samplePrompt?: string }[] }>(
      `You are a title-sequence director. Propose EXACTLY 4 distinct visual-style options for a TV-intro video (10 seconds). HARD CONSTRAINT: every option MUST be live-action photorealistic with real human actors — NO animation, NO cartoon, NO anime, NO 3D render, NO CGI look, NO illustration, NO painted or stylized aesthetic. Variation is ONLY in cinematography / mood / editing (e.g. dark noir montage, bright kinetic montage, intimate character close-ups, high-contrast typographic cutaways) — never in medium. Every samplePrompt must explicitly include "live-action photorealistic, real actors, real skin". Return JSON { styles: [{ key (slug), name (2-4 words), vibe (1 sentence), samplePrompt (2-3 sentences describing the shot as a director would brief a DP) }] }.`,
      `SERIES BIBLE:\n${bible}\n\nRECURRING CAST:\n${castBlock || "(none yet)"}\n\nRECENT EPISODES:\n${recent || "(no episodes yet)"}\n\nLANGUAGE: ${season.series.project.language}`,
      {
        temperature: 0.9, maxTokens: 2000,
        entityType: "SEASON_OPENING", entityId: season.id,
        description: `Opening · style suggestions`,
        organizationId: ctx.organizationId, projectId: season.series.projectId,
      },
    ));

    const styles = Array.isArray(result?.styles) ? result.styles.filter((s): s is { key: string; name: string; vibe: string; samplePrompt: string } => !!s?.key && !!s?.name && !!s?.samplePrompt) : [];
    if (styles.length === 0) {
      throw Object.assign(new Error("AI returned no valid styles"), { statusCode: 502 });
    }
    // Always include a guaranteed character-showcase option as the first/default
    // style — user explicitly asked for this: "אחד מהם יהיה דיפולט עם הדמויות
    // והשמות שלהם כפתיח". The build-prompt route respects the key so this one
    // always forces character reveals + on-screen name cards.
    const characterShowcase = {
      key: "character-showcase",
      name: "היכרות עם הדמויות",
      vibe: "כל דמות בסצנת סיגנצ'ר קצרה, שם שלה נחשף על המסך בכרטיסיית טיפוגרפיה — פתיח קלאסי של סדרה.",
      samplePrompt: `Title-sequence reveal: cut through signature character beats — each recurring cast member gets a 1-2 second dramatic close-up in character, mid-action, followed by a clean sans-serif name card over a tonal color wash. Close-ups shot 50mm wide-open, cinematic key light with practical fill, matching the show's genre. The series title card lands last in a confident typographic beat.`,
      isDefault: true as const,
    };
    // AI provides the other styles (up to 3 more) to keep total at 4.
    const aiStyles = styles.filter((s) => s.key !== "character-showcase").slice(0, 3);
    return ok({ styles: [characterShowcase, ...aiStyles] });
  } catch (e) {
    const err = e as { message?: string; statusCode?: number };
    if (!err.message?.startsWith("[")) err.message = `[${stage}] ${err.message ?? "unknown"}`;
    return handleError(err);
  }
}
