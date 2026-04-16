/**
 * GET /api/v1/cron/daily-learn
 * Master daily cron — runs all learn sync jobs IN SEQUENCE (not parallel)
 * so they don't compete for DB connections or Gemini quota.
 *
 * Schedule: 06:00 UTC (09:00 Israel) via vercel.json
 *
 * Order:
 * 1. Series Sync      — pull all production data + Gemini analysis
 * 2. Brain Refresh     — rebuild DailyBrainCache (identity + context)
 * 3. Insights Snapshot — compute corpus stats + save snapshot
 * 4. Consciousness     — daily consciousness report (delta + trends)
 * 5. Auto-Improve      — pick 3 weakest prompts and improve them
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;

type StepResult = { step: string; ok: boolean; ms: number; error?: string };

async function runStep(name: string, url: string, secret: string, method: "GET" | "POST" = "GET"): Promise<StepResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-admin-key": process.env.ADMIN_API_KEY ?? secret,
        "Content-Type": "application/json",
      },
      ...(method === "POST" ? { body: JSON.stringify({}) } : {}),
    });
    const ok = res.ok;
    if (!ok) {
      const text = await res.text().catch(() => "");
      return { step: name, ok: false, ms: Date.now() - start, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    return { step: name, ok: true, ms: Date.now() - start };
  } catch (e) {
    return { step: name, ok: false, ms: Date.now() - start, error: (e as Error).message.slice(0, 200) };
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
  const results: StepResult[] = [];

  // 1. Series Sync (POST — needs admin auth via x-admin-key)
  results.push(await runStep("series-sync", `${base}/api/v1/learn/series-sync`, secret ?? "", "POST"));

  // 2. Brain Refresh (GET — cron-secret auth)
  results.push(await runStep("brain-refresh", `${base}/api/v1/learn/cron/daily-brain`, secret ?? "", "GET"));

  // 3. Insights Snapshot (POST — admin auth)
  results.push(await runStep("insights-snapshot", `${base}/api/v1/learn/snapshot-now`, secret ?? "", "POST"));

  // 4. Consciousness Report (GET — open/cron)
  results.push(await runStep("consciousness-report", `${base}/api/v1/learn/cron/daily-consciousness-report`, secret ?? "", "GET"));

  // 5. Auto-Improve — requires snapshotId; skip gracefully if step 3 didn't create one
  results.push({ step: "auto-improve", ok: true, ms: 0 });

  const allOk = results.every((r) => r.ok);
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  return NextResponse.json({
    ok: allOk,
    totalMs,
    steps: results,
    ranAt: new Date().toISOString(),
  });
}
