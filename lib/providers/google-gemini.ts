/**
 * Google Gemini "balance" sync.
 *
 * Google AI Studio doesn't expose a real-time balance endpoint — the API
 * is post-pay against your Google Cloud Billing account. So we sync by:
 *  1. Verifying the API key is reachable (a tiny ping to /v1/models)
 *  2. Summing month-to-date CostEntry rows for this provider — that becomes
 *     `usageThisMonth`. The wallet's `availableCredits` is whatever the user
 *     sets as a monthly budget (top-up); we only deduct from it.
 */
import { prisma } from "../prisma";

const PING_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiBalance {
  reachable: boolean;
  usageThisMonth: number;
  callsThisMonth: number;
  source: "google-direct";
  raw?: unknown;
}

export async function fetchGeminiUsage(organizationId: string): Promise<GeminiBalance> {
  const key = process.env.GEMINI_API_KEY;
  let reachable = false;
  let raw: unknown = null;
  if (key) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4_000);
      const res = await fetch(`${PING_URL}?key=${key}`, { signal: ctl.signal });
      clearTimeout(t);
      reachable = res.ok;
      if (res.ok) raw = { models: ((await res.json()) as { models?: unknown[] }).models?.length ?? 0 };
    } catch { /* unreachable */ }
  }

  // Compute MTD usage from our own CostEntry log. Defensive — if the query
  // throws for any reason (schema drift, etc.) we still return a valid result.
  let usageThisMonth = 0;
  let callsThisMonth = 0;
  try {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const orgProjects = await prisma.project.findMany({ where: { organizationId }, select: { id: true } });
    const projectIds = orgProjects.map((p) => p.id);
    // Plain query — no relation filter — then JS-filter by source/org.
    const entries = await prisma.costEntry.findMany({
      where: { entityType: "AI_TEXT", createdAt: { gte: startOfMonth } },
      select: { totalCost: true, projectId: true, meta: true },
    });
    const orgSet = new Set(projectIds);
    const googleEntries = entries.filter((e) => {
      if (e.projectId && !orgSet.has(e.projectId)) return false;
      const m = (e.meta as { source?: string } | null) ?? {};
      return m.source === "google-direct";
    });
    usageThisMonth = +googleEntries.reduce((s, e) => s + e.totalCost, 0).toFixed(6);
    callsThisMonth = googleEntries.length;
  } catch (e) {
    raw = { ...(raw as object ?? {}), usageQueryError: (e as Error).message.slice(0, 200) };
  }

  return { reachable, usageThisMonth, callsThisMonth, source: "google-direct", raw };
}
