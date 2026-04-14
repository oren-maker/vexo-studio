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

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const entries = await prisma.costEntry.findMany({
    where: {
      entityType: "AI_TEXT",
      project: { organizationId },
      createdAt: { gte: startOfMonth },
    },
    select: { totalCost: true, meta: true },
  });
  const googleEntries = entries.filter((e) => {
    const m = (e.meta as { source?: string } | null) ?? {};
    return m.source === "google-direct";
  });

  return {
    reachable,
    usageThisMonth: +googleEntries.reduce((s, e) => s + e.totalCost, 0).toFixed(6),
    callsThisMonth: googleEntries.length,
    source: "google-direct",
    raw,
  };
}
