import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Expected Calibration Error — bins actions by confidence (10 buckets of 10%)
// and compares mean confidence in each bin to actual accept rate in that bin.
// ECE = Σ (bin_size / total) × |bin_mean_confidence − bin_accept_rate|.
// Lower = better calibrated. Ideal brain: ECE ≈ 0.
export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    // Only rows with a numeric confidence are usable. META actions (ask/estimate)
    // lack confidence by design and are excluded.
    const rows = await (prisma as any).actionOutcome.findMany({
      where: { confidence: { not: null } },
      select: { confidence: true, outcome: true, actionType: true },
      take: 5000,
      orderBy: { createdAt: "desc" },
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, ece: null, totalRows: 0, bins: [], note: "אין עדיין מספיק נתונים" });
    }

    const bins: { range: string; count: number; meanConfidence: number; acceptRate: number; gap: number }[] = [];
    let weightedGap = 0;
    for (let i = 0; i < 10; i++) {
      const lo = i / 10;
      const hi = (i + 1) / 10;
      const slice = rows.filter((r: any) => r.confidence >= lo && (i === 9 ? r.confidence <= hi : r.confidence < hi));
      if (slice.length === 0) continue;
      const meanConf = slice.reduce((s: number, r: any) => s + r.confidence, 0) / slice.length;
      const accepts = slice.filter((r: any) => r.outcome === "accepted").length;
      const acceptRate = accepts / slice.length;
      const gap = Math.abs(meanConf - acceptRate);
      weightedGap += (slice.length / rows.length) * gap;
      bins.push({
        range: `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`,
        count: slice.length,
        meanConfidence: +meanConf.toFixed(3),
        acceptRate: +acceptRate.toFixed(3),
        gap: +gap.toFixed(3),
      });
    }

    // Per-action-type breakdown — which actions drift most?
    const actionTypes = Array.from(new Set(rows.map((r: any) => r.actionType))) as string[];
    const perAction = actionTypes.map((type) => {
      const slice = rows.filter((r: any) => r.actionType === type);
      const accepts = slice.filter((r: any) => r.outcome === "accepted").length;
      const meanConf = slice.reduce((s: number, r: any) => s + r.confidence, 0) / slice.length;
      return {
        actionType: type,
        count: slice.length,
        meanConfidence: +meanConf.toFixed(3),
        acceptRate: +(accepts / slice.length).toFixed(3),
        gap: +Math.abs(meanConf - accepts / slice.length).toFixed(3),
      };
    }).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      ok: true,
      ece: +weightedGap.toFixed(4),
      totalRows: rows.length,
      bins,
      perAction,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
