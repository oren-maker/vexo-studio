import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const chat = await prisma.brainChat.create({
    data: { title: "הצעות שדרוג מ-Claude (demo)" },
  });

  const suggestions = [
    "תשדרג את המוח שיהיה לו 'מצב הצעות יומי' — כל בוקר הוא מעלה 3 הצעות שדרוג קונקרטיות למערכת ומחכה לאישור שלך לפני יישום. זה יהפוך אותו מ-reactive ל-proactive.",
    "תשדרג שהמוח יידע לזהות פרומפטים חוזרים בקורפוס (דומות סמנטית >85%) ויציע למזג אותם או למחוק כפילויות כדי לשמור על ספרייה נקייה.",
  ];

  const created: any[] = [];
  for (const text of suggestions) {
    const msg = await prisma.brainMessage.create({
      data: { chatId: chat.id, role: "user", content: text },
    });
    const up = await prisma.brainUpgradeRequest.create({
      data: {
        chatId: chat.id,
        messageId: msg.id,
        instruction: text,
        context: "claude-demo",
        status: "pending",
        priority: 2,
      },
    });
    created.push({ messageId: msg.id, upgradeId: up.id });
  }

  return NextResponse.json({ ok: true, chatId: chat.id, created });
}
