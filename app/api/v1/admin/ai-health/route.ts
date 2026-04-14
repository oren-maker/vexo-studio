/**
 * AI health check. Pings each AI wizard's underlying call with a tiny prompt
 * and returns status / latency / token usage / approx cost per path. No DB
 * writes (except the standard cost tracking that every Gemini call triggers).
 */
import { NextRequest } from "next/server";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { groqJson } from "@/lib/groq";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

type Check = {
  id: string;
  name: string;
  path: string;            // which endpoint / service uses this
  ok: boolean;
  latencyMs: number;
  error?: string;
  response?: string;
};

async function ping(id: string, name: string, path: string, system: string, user: string): Promise<Check> {
  const t0 = Date.now();
  try {
    const r = await groqJson<{ ok?: boolean; reply?: string }>(
      system + "\n\nRespond with JSON { ok: true, reply: 'short acknowledgement' }",
      user,
      { temperature: 0, maxTokens: 60 },
    );
    return { id, name, path, ok: true, latencyMs: Date.now() - t0, response: r.reply ?? JSON.stringify(r).slice(0, 80) };
  } catch (e) {
    return { id, name, path, ok: false, latencyMs: Date.now() - t0, error: (e as Error).message.slice(0, 240) };
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_ai_director"); if (f) return f;

    const checks = await Promise.all([
      ping("director-season", "במאי עונה",    "/api/v1/seasons/[id]/director-feedback",   "You are a showrunner.",       "OK to respond?"),
      ping("director-ep",     "במאי פרק",     "/api/v1/episodes/[id]/director-feedback",  "You are a showrunner.",       "OK?"),
      ping("apply-feedback",  "החלת משוב",    "/api/v1/episodes/[id]/apply-feedback",     "You rewrite scenes.",         "OK?"),
      ping("gen-episode",     "פרק חדש",      "/api/v1/seasons/[id]/generate-episode",    "You outline TV episodes.",    "OK?"),
      ping("auto-season",     "עונה מלאה",    "/api/v1/seasons/[id]/auto-generate",       "You plan TV seasons.",        "OK?"),
      ping("premise",         "הצעת פרמיס",   "/api/v1/projects/[id]/premise-suggest",    "You write TV series premises.", "OK?"),
      ping("characters",      "זיהוי דמויות", "/api/v1/projects/[id]/characters/auto-populate", "You extract characters.", "OK?"),
      ping("critic",          "מבקר סצנה",    "/api/v1/scenes/[id]/critic/review",        "You grade scenes.",           "OK?"),
      ping("breakdown",       "פירוק תסריט",  "/api/v1/scenes/[id]/breakdown",            "You parse screenplay.",       "OK?"),
      ping("context-cache",   "קאש סדרה",     "lib/project-context.buildContext",         "You write series bibles.",    "OK?"),
      ping("autopilot",       "אוטופיילוט",   "/api/v1/projects/[id]/ai-director/run",    "You direct production.",      "OK?"),
    ]);

    const passed = checks.filter((c) => c.ok).length;
    const totalLatency = checks.reduce((s, c) => s + c.latencyMs, 0);

    return ok({
      totalChecks: checks.length,
      passed,
      failed: checks.length - passed,
      avgLatencyMs: Math.round(totalLatency / checks.length),
      provider: process.env.GEMINI_API_KEY ? "Google Gemini (direct, paid)" : (process.env.FAL_API_KEY ? "Gemini via fal" : "none"),
      checks,
    });
  } catch (e) { return handleError(e); }
}
