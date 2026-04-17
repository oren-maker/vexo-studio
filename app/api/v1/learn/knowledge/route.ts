import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const tags = (searchParams.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 20)));

  const nodes = await prisma.knowledgeNode.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(tags.length ? { tags: { hasSome: tags } } : {}),
    },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items: nodes });
}
