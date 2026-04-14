/**
 * Aggregate text-AI usage (Gemini via fal) for the org. Used by the
 * wallets page to show a virtual 'Gemini (paid via fal)' row.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const entries = await prisma.costEntry.findMany({
      where: {
        entityType: "AI_TEXT",
        project: { organizationId: ctx.organizationId },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, totalCost: true, description: true, createdAt: true, projectId: true, meta: true },
    });
    const totalCost = entries.reduce((s, e) => s + e.totalCost, 0);
    const totalCalls = entries.length;
    const tokenSum = entries.reduce((acc, e) => {
      const m = (e.meta as { inputTokens?: number; outputTokens?: number } | null) ?? {};
      acc.input += m.inputTokens ?? 0;
      acc.output += m.outputTokens ?? 0;
      return acc;
    }, { input: 0, output: 0 });

    // Break down by source: Google direct vs fal proxy — both are paid Gemini 2.5 Flash
    const bySource = entries.reduce<Record<string, { calls: number; cost: number; in: number; out: number }>>((acc, e) => {
      const m = (e.meta as { source?: string; inputTokens?: number; outputTokens?: number } | null) ?? {};
      const src = m.source ?? "unknown";
      acc[src] = acc[src] ?? { calls: 0, cost: 0, in: 0, out: 0 };
      acc[src].calls++;
      acc[src].cost += e.totalCost;
      acc[src].in  += m.inputTokens ?? 0;
      acc[src].out += m.outputTokens ?? 0;
      return acc;
    }, {});

    const lastUsedAt = entries[0]?.createdAt ?? null;
    return ok({
      provider: "Gemini 2.5 Flash (paid)",
      pricingNote: "$0.075 per 1M input · $0.30 per 1M output",
      totalCost: +totalCost.toFixed(4),
      totalCalls,
      inputTokens: tokenSum.input,
      outputTokens: tokenSum.output,
      bySource: {
        google: bySource["google-direct"] ?? { calls: 0, cost: 0, in: 0, out: 0 },
        fal:    bySource["fal-any-llm"]   ?? { calls: 0, cost: 0, in: 0, out: 0 },
      },
      lastUsedAt,
      recent: entries.slice(0, 10),
    });
  } catch (e) { return handleError(e); }
}
