import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Aggregated learning-side spend (ApiUsage table) so /admin/wallets can
// merge it into the unified system cost view.
export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const [agg, byEngine, byOperation, recent7d] = await Promise.all([
    prisma.apiUsage.aggregate({
      _sum: { inputTokens: true, outputTokens: true, imagesOut: true, usdCost: true },
      _count: true,
    }),
    prisma.apiUsage.groupBy({
      by: ["engine"],
      _sum: { usdCost: true, inputTokens: true, outputTokens: true, imagesOut: true },
      _count: true,
    }),
    prisma.apiUsage.groupBy({
      by: ["operation"],
      _sum: { usdCost: true },
      _count: true,
    }),
    prisma.$queryRaw<Array<{ day: string; usd: number; calls: number }>>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             SUM("usdCost")::float AS usd,
             COUNT(*)::int AS calls
      FROM "ApiUsage"
      WHERE "createdAt" > NOW() - INTERVAL '7 days'
      GROUP BY 1
      ORDER BY 1 DESC
    `,
  ]);

  return NextResponse.json({
    totals: {
      callCount: agg._count,
      usdCost: agg._sum.usdCost ?? 0,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      imagesOut: agg._sum.imagesOut ?? 0,
    },
    byEngine: byEngine.map((e) => ({
      engine: e.engine || "unknown",
      callCount: e._count,
      usdCost: e._sum.usdCost ?? 0,
      tokens: (e._sum.inputTokens ?? 0) + (e._sum.outputTokens ?? 0),
      imagesOut: e._sum.imagesOut ?? 0,
    })),
    byOperation: byOperation.map((o) => ({
      operation: o.operation,
      callCount: o._count,
      usdCost: o._sum.usdCost ?? 0,
    })),
    last7days: recent7d,
  });
}
