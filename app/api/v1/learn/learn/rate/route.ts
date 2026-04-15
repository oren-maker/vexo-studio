import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { sourceId, rating } = await req.json();
    if (!sourceId) return NextResponse.json({ ok: false, error: "sourceId נדרש" }, { status: 400 });
    const r = rating === null ? null : Number(rating);
    if (r !== null && (!Number.isInteger(r) || r < 1 || r > 5)) {
      return NextResponse.json({ ok: false, error: "דירוג חייב להיות 1-5 או null" }, { status: 400 });
    }
    await prisma.learnSource.update({
      where: { id: sourceId },
      data: { userRating: r },
    });
    return NextResponse.json({ ok: true, rating: r });
  } catch (e: any) {
    console.error("[rate]", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
