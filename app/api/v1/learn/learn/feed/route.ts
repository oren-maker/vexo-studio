import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const tags = (searchParams.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
  const difficulty = searchParams.get("difficulty");
  const unread = searchParams.get("unread") === "true";
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 30)));

  if (userId) {
    const subs = await prisma.subscriberPrompt.findMany({
      where: {
        userId,
        ...(unread ? { viewed: false } : {}),
      },
      include: { source: { include: { analysis: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ items: subs });
  }

  const items = await prisma.learnSource.findMany({
    where: {
      status: "complete",
      ...(tags.length || difficulty
        ? {
            analysis: {
              is: {
                ...(tags.length ? { tags: { hasSome: tags } } : {}),
                ...(difficulty ? { difficulty } : {}),
              },
            },
          }
        : {}),
    },
    include: { analysis: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items });
}
