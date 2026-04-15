import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { rating } = await req.json();
    const r = rating === null ? null : Number(rating);
    if (r !== null && (!Number.isInteger(r) || r < 1 || r > 5)) {
      return NextResponse.json({ error: "rating must be 1-5 or null" }, { status: 400 });
    }
    await prisma.guide.update({ where: { slug: params.slug }, data: { userRating: r } });
    return NextResponse.json({ ok: true, rating: r });
  } catch (e: any) {
    console.error("[guide rate]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
