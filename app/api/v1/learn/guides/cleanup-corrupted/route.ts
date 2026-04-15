import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Detect titles/descriptions with the U+FFFD replacement char (mangled UTF-8) and remove them.
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const allTrans = await prisma.guideTranslation.findMany({
    select: { id: true, guideId: true, title: true, description: true },
  });

  const REPLACEMENT_CHAR = "\uFFFD";
  const corruptedGuideIds = new Set<string>();
  for (const t of allTrans) {
    if (t.title.includes(REPLACEMENT_CHAR) || (t.description || "").includes(REPLACEMENT_CHAR)) {
      corruptedGuideIds.add(t.guideId);
    }
  }

  if (corruptedGuideIds.size === 0) {
    return NextResponse.json({ ok: true, deleted: 0, message: "No corrupted guides found" });
  }

  const deleted = await prisma.guide.deleteMany({
    where: { id: { in: Array.from(corruptedGuideIds) } },
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
