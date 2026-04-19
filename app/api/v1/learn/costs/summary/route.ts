import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Cost summary for the /learn/costs dashboard.
// Returns: day-by-day totals + breakdowns by provider + category + project.
// Window defaults to last 30 days; query ?days=N to widen.
export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [entries, providers, projects] = await Promise.all([
    prisma.costEntry.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, createdAt: true, totalCost: true, costCategory: true, providerId: true, projectId: true, description: true, meta: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.provider.findMany({ select: { id: true, name: true, category: true } }),
    prisma.project.findMany({ select: { id: true, name: true } }),
  ]);

  const providerMap = new Map(providers.map((p) => [p.id, p]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Aggregate buckets
  const byDay = new Map<string, number>();
  const byProvider = new Map<string, { id: string | null; name: string; total: number; count: number }>();
  const byCategory = new Map<string, { total: number; count: number }>();
  const byProject = new Map<string, { id: string | null; name: string; total: number; count: number }>();

  for (const e of entries) {
    const day = e.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + e.totalCost);

    const prov = e.providerId ? providerMap.get(e.providerId) : null;
    const provName = prov?.name ?? "(unassigned)";
    const pp = byProvider.get(provName) ?? { id: e.providerId, name: provName, total: 0, count: 0 };
    pp.total += e.totalCost; pp.count++;
    byProvider.set(provName, pp);

    const cat = e.costCategory || "(unknown)";
    const cc = byCategory.get(cat) ?? { total: 0, count: 0 };
    cc.total += e.totalCost; cc.count++;
    byCategory.set(cat, cc);

    const proj = e.projectId ? projectMap.get(e.projectId) : null;
    const projName = proj?.name ?? "(none)";
    const ppr = byProject.get(projName) ?? { id: e.projectId, name: projName, total: 0, count: 0 };
    ppr.total += e.totalCost; ppr.count++;
    byProject.set(projName, ppr);
  }

  // Fill missing days with 0 so the sparkline has a full timeline
  const dayList: { day: string; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dayList.push({ day: d, total: +(byDay.get(d) ?? 0).toFixed(4) });
  }

  const grand = entries.reduce((s, e) => s + e.totalCost, 0);

  return NextResponse.json({
    ok: true,
    windowDays: days,
    grandTotal: +grand.toFixed(4),
    entriesCount: entries.length,
    byDay: dayList,
    byProvider: [...byProvider.values()].map((p) => ({ ...p, total: +p.total.toFixed(4) })).sort((a, b) => b.total - a.total),
    byCategory: [...byCategory.entries()].map(([name, v]) => ({ name, total: +v.total.toFixed(4), count: v.count })).sort((a, b) => b.total - a.total),
    byProject: [...byProject.values()].map((p) => ({ ...p, total: +p.total.toFixed(4) })).sort((a, b) => b.total - a.total),
  });
}
