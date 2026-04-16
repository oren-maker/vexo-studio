import { NextRequest, NextResponse } from "next/server";
import { snapshotInsights } from "@/lib/learn/insights-snapshots";
import { runAutoImprovement } from "@/lib/learn/auto-improve";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const snap = await snapshotInsights();
    // Auto-improve a small batch after every snapshot so the corpus keeps tightening.
    let improvement: any = null;
    try {
      improvement = await runAutoImprovement(snap.snapshotId, 3);
    } catch (e: any) {
      improvement = { error: String(e.message || e).slice(0, 300) };
    }
    return NextResponse.json({ ok: true, snapshot: snap, improvement });
  } catch (e: any) {
    console.error("[cron insights-snapshot]", e);
    return NextResponse.json({
      error: String(e?.message || e).slice(0, 600),
      stack: process.env.NODE_ENV !== "production" ? String(e?.stack || "").slice(0, 600) : undefined,
    }, { status: 500 });
  }
}
