/**
 * GET /api/v1/learn/series-history
 * Returns all series_analysis snapshots (archive) + the latest one.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/learn/auth";
import { ok, handleError } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const snapshots = await prisma.insightsSnapshot.findMany({
      where: { kind: "series_analysis" },
      orderBy: { takenAt: "desc" },
      take: 50,
    });
    return ok({ snapshots });
  } catch (e) { return handleError(e); }
}
