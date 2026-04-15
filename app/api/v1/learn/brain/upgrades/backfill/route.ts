import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Scan all past user messages in chats. If a user message has instructional content
// but no corresponding BrainUpgradeRequest row exists, create one.
const INSTRUCTION_PATTERNS = [
  "תעשה", "תגדיר", "שיהיה", "שימור", "תזכור", "שדרוג", "תוסיף", "צריך ש", "חשוב ש",
  "תדאג", "שיופיע", "שהמוח", "תשדרג", "תרשם", "תשמור", "תדע", "תנסה", "תבדוק", "תחבר",
  "תייצר", "שתדע", "תעבור", "תחליף", "שינוי", "תקן", "תתקן", "לשדרוגים", "מתעדכן",
];

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const userMessages = await prisma.brainMessage.findMany({
    where: { role: { in: ["user", "brain"] } },
    orderBy: { createdAt: "asc" },
    include: { chat: true },
  });

  const existing = await prisma.brainUpgradeRequest.findMany({ select: { messageId: true } });
  const existingIds = new Set(existing.map((e) => e.messageId).filter(Boolean));

  let created = 0;
  const samples: Array<{ id: string; text: string }> = [];

  const BRAIN_SUGGESTION_PATTERNS = /הצעה|שדרוג|מומלץ|כדאי|אפשר לשפר|צריך ש|רעיון|אוכל להציע|הייתי מציע|הייתי ממליץ|יכולת חדשה|פיצ'ר|feature|upgrade/i;

  for (const m of userMessages) {
    if (existingIds.has(m.id)) continue;
    if (m.content.length < 15) continue;
    let hit = false;
    let label = m.role;
    if (m.role === "user") {
      hit = INSTRUCTION_PATTERNS.some((p) => m.content.includes(p));
    } else if (m.role === "brain") {
      hit = BRAIN_SUGGESTION_PATTERNS.test(m.content);
      label = "brain-suggestion";
    }
    if (!hit) continue;

    await prisma.brainUpgradeRequest.create({
      data: {
        chatId: m.chatId,
        messageId: m.id,
        instruction: m.content.slice(0, 2000),
        context: label,
        status: "pending",
        priority: m.role === "brain" ? 4 : 3,
      },
    });
    created++;
    if (samples.length < 10) samples.push({ id: m.id, text: `[${label}] ${m.content.slice(0, 120)}` });
  }

  return NextResponse.json({ ok: true, created, scanned: userMessages.length, samples });
}
