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
    return NextResponse.json({ ok: true, marked: 0, message: "No corrupted guides found" });
  }

  // Soft mark corrupted guides with status="CORRUPTED" instead of deleting them
  // (see memory: never-delete-always-persist). The UI filters out non-"draft"/
  // "published" guides from the main library so they disappear from user view
  // but the data stays recoverable if the UTF-8 corruption can be fixed later.
  const marked = await prisma.guide.updateMany({
    where: { id: { in: Array.from(corruptedGuideIds) } },
    data: { status: "corrupted" },
  });

  return NextResponse.json({ ok: true, marked: marked.count, deleted: 0, mode: "soft-mark" });
}
