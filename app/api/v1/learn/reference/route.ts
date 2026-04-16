import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const kind = new URL(req.url).searchParams.get("kind") || undefined;
  const items = await prisma.brainReference.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ kind: "asc" }, { order: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const body = await req.json();
  const { kind, name, shortDesc, longDesc, tags } = body ?? {};
  if (!kind || !name || !shortDesc || !longDesc) {
    return NextResponse.json({ error: "kind, name, shortDesc, longDesc required" }, { status: 400 });
  }
  if (!["emotion", "sound"].includes(kind)) {
    return NextResponse.json({ error: "kind must be emotion|sound" }, { status: 400 });
  }
  const last = await prisma.brainReference.findFirst({ where: { kind }, orderBy: { order: "desc" } });
  const item = await prisma.brainReference.create({
    data: {
      kind,
      name: String(name).trim(),
      shortDesc: String(shortDesc).trim(),
      longDesc: String(longDesc).trim(),
      tags: Array.isArray(tags) ? tags.map((t: any) => String(t)).slice(0, 10) : [],
      order: (last?.order ?? 0) + 1,
    },
  });
  return NextResponse.json({ item }, { status: 201 });
}
