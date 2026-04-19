// Weekly evaluation harness.
// Runs every GoldenPrompt through the brain chat, scores the reply against
// expected actions + keyword constraints, persists results as an
// InsightsSnapshot(kind="eval") so /learn/insights can chart pass rate drift.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { GOLDEN_PROMPTS, type GoldenPrompt } from "@/lib/learn/golden-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

type Result = {
  id: string;
  prompt: string;
  pass: boolean;
  checks: { name: string; pass: boolean; detail?: string }[];
  replyPreview: string;
  detectedAction: string | null;
  detectedConfidence: number | null;
};

function detectAction(reply: string): { type: string | null; confidence: number | null } {
  // Look for ```action ... ``` block
  const m = reply.match(/```(?:action)?\s*({[\s\S]*?})\s*```/);
  if (!m) return { type: null, confidence: null };
  try {
    const parsed = JSON.parse(m[1]);
    return {
      type: typeof parsed.type === "string" ? parsed.type : null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    };
  } catch { return { type: null, confidence: null }; }
}

function evaluate(g: GoldenPrompt, reply: string): Result {
  const checks: Result["checks"] = [];
  const { type, confidence } = detectAction(reply);

  if (g.expectedAction) {
    if (g.expectedAction.type === "none") {
      checks.push({ name: "no action emitted", pass: !type, detail: type ? `got action=${type}` : undefined });
    } else {
      checks.push({
        name: `action=${g.expectedAction.type}`,
        pass: type === g.expectedAction.type,
        detail: type && type !== g.expectedAction.type ? `got ${type}` : (!type ? "no action in reply" : undefined),
      });
      if (g.expectedAction.minConfidence != null) {
        checks.push({
          name: `confidence >= ${g.expectedAction.minConfidence}`,
          pass: (confidence ?? 0) >= g.expectedAction.minConfidence,
          detail: `got ${confidence ?? "n/a"}`,
        });
      }
    }
  }

  if (g.mustIncludeAny?.length) {
    const hit = g.mustIncludeAny.some((kw) => reply.toLowerCase().includes(kw.toLowerCase()));
    checks.push({
      name: `includes any of [${g.mustIncludeAny.join(", ")}]`,
      pass: hit,
    });
  }
  if (g.mustAvoidAll?.length) {
    const violations = g.mustAvoidAll.filter((kw) => reply.toLowerCase().includes(kw.toLowerCase()));
    checks.push({
      name: `avoids all [${g.mustAvoidAll.join(", ")}]`,
      pass: violations.length === 0,
      detail: violations.length > 0 ? `found: ${violations.join(", ")}` : undefined,
    });
  }

  const pass = checks.every((c) => c.pass);
  return {
    id: g.id,
    prompt: g.prompt,
    pass,
    checks,
    replyPreview: reply.slice(0, 300),
    detectedAction: type,
    detectedConfidence: confidence,
  };
}

async function runBrainOnce(prompt: string, authHeader: string): Promise<string> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/v1/learn/brain/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: authHeader, "x-vexo-admin-key": process.env.VEXO_ADMIN_KEY ?? "" },
    body: JSON.stringify({ message: prompt, pageContext: null }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`brain responded ${res.status}`);
  const j: any = await res.json();
  return String(j.reply ?? j.content ?? "");
}

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const cookieHeader = req.headers.get("cookie") ?? "";
  const results: Result[] = [];

  for (const g of GOLDEN_PROMPTS) {
    try {
      const reply = await runBrainOnce(g.prompt, cookieHeader);
      results.push(evaluate(g, reply));
    } catch (e) {
      results.push({
        id: g.id,
        prompt: g.prompt,
        pass: false,
        checks: [{ name: "brain responded", pass: false, detail: String((e as Error).message).slice(0, 200) }],
        replyPreview: "(error)",
        detectedAction: null,
        detectedConfidence: null,
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const passRate = total > 0 ? +(passed / total).toFixed(3) : 0;

  // InsightsSnapshot requires corpus stats — fill them with 0 for eval snapshots
  // since the point of kind=eval is the `data` blob, not the corpus delta.
  await prisma.insightsSnapshot.create({
    data: {
      kind: "eval",
      takenAt: new Date(),
      sourcesCount: 0,
      analysesCount: 0,
      nodesCount: 0,
      avgTechniques: 0,
      avgWords: 0,
      timecodePct: 0,
      summary: `Eval: ${passed}/${total} passed (${(passRate * 100).toFixed(0)}%). Failed: ${results.filter((r) => !r.pass).map((r) => r.id).join(", ") || "none"}.`,
      data: { results, passed, total, passRate } as object,
    },
  });

  return NextResponse.json({ ok: true, passed, total, passRate, results });
}

export const POST = GET;
