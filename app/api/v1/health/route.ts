import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  return NextResponse.json({ status: dbOk ? "ok" : "degraded", db: dbOk });
}
