import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Activity counts per day over the last N days (default 90).
// Aggregates ActionOutcome + SceneLog into a single dataset so the UI
// can render a GitHub-style calendar heatmap.

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const days = Math.max(7, Math.min(365, Number(new URL(req.url).searchParams.get("days")) || 90));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [outcomes, sceneLogs] = await Promise.all([
    (prisma as any).actionOutcome.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, actionType: true, outcome: true },
      take: 10000,
    }),
    (prisma as any).sceneLog.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, action: true, actor: true },
      take: 10000,
    }),
  ]);

  const byDay = new Map<string, { total: number; actions: number; logs: number; failures: number }>();
  function bucket(day: string) {
    return byDay.get(day) ?? { total: 0, actions: 0, logs: 0, failures: 0 };
  }

  for (const o of outcomes) {
    const d = new Date(o.createdAt).toISOString().slice(0, 10);
    const b = bucket(d);
    b.total++; b.actions++;
    if (o.outcome === "error" || o.outcome === "rejected") b.failures++;
    byDay.set(d, b);
  }
  for (const l of sceneLogs) {
    const d = new Date(l.createdAt).toISOString().slice(0, 10);
    const b = bucket(d);
    b.total++; b.logs++;
    byDay.set(d, b);
  }

  // Fill empty days so the heatmap grid is stable
  const series: { day: string; total: number; actions: number; logs: number; failures: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const b = byDay.get(d) ?? { total: 0, actions: 0, logs: 0, failures: 0 };
    series.push({ day: d, ...b });
  }

  // Action-type breakdown (last N days, across all)
  const byActionType = new Map<string, number>();
  for (const o of outcomes) {
    byActionType.set(o.actionType, (byActionType.get(o.actionType) ?? 0) + 1);
  }

  return NextResponse.json({
    ok: true,
    windowDays: days,
    totalEvents: outcomes.length + sceneLogs.length,
    actionsTotal: outcomes.length,
    logsTotal: sceneLogs.length,
    series,
    byActionType: [...byActionType.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  });
}
