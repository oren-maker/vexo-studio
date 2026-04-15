import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const pending = await prisma.brainUpgradeRequest.findMany({ where: { status: "pending" } });

  const ONE_SHOT = /^(תייצר|צור|שלח לי|תשלח|אני רוצה שתייצר|תייצר לי|אחלה תייצר|מוח תייצר)|תייצר לי פרומט|תייצר פרומט/;
  const BRAIN_CONFIRMATION = /^רשמתי|^הכנסתי|^מצוין, אורן|^בוצע\.|המחסום של.*הוסר|Knowledge Nodes שלי/;
  const BRAIN_OUTPUT = /^✅ יצרתי פרומפט|VISUAL STYLE:|📄 תצוגה מקדימה/;
  const QUESTION = /^ומה אתה מציע|^מה אתה מציע|יש לך רעיון\s*\?/;
  const BRAIN_SUGGESTION_REVIEW = /אני מציע שנסקור|אוכל להציע|הייתי מציע שנעבור/;
  const ASK_TOPIC = /איזה נושא|ספק לי|נושא ספציפי|סגנון.*תתמקד|נושא רצוי|נושא\??$/;
  const META_SYSTEM = /תכניס.*לשדרוגים|רשימת השדרוגים/;
  const ALREADY_BUILT_MARKERS = /הכי מפורט|טכניקה שלמדת|תמיד תזכור|Auto-Evolution|Style.{0,3}Lock|Reverse Engineering|Selective Refine|Batch Actions|מחסום של.אני לא יכול|מוכן ללמוד|רעיון.{0,3}בונה.*יכולת/i;
  const DAILY_GEN = /תייצר דברים חדשים|יום אחד מעניין|המלצה יומית|מצב הצעות יומי|דברים חדשים כתוצאה/;
  const DEDUPE = /לזהות פרומפטים חוזרים|דומות סמנטית|למזג אותם|כפילויות/;

  let done = 0, rejected = 0, kept = 0, updates = 0;
  for (const u of pending) {
    let status: string | null = null;
    let note = "";
    const t = u.instruction;

    if (BRAIN_OUTPUT.test(t)) { status = "rejected"; note = "זה תוצר של compose_prompt שנלכד בטעות, לא שדרוג"; }
    else if (BRAIN_CONFIRMATION.test(t)) { status = "done"; note = "אישור/הצהרה של המוח, כבר מיושם במערכת"; }
    else if (QUESTION.test(t)) { status = "rejected"; note = "שאלה, לא שדרוג"; }
    else if (BRAIN_SUGGESTION_REVIEW.test(t)) { status = "in-progress"; note = "הצעה לשיפור פרומפטים קצרים בקורפוס — ייבחן בסבב הבא"; }
    else if (/לא צריך.*אני רוצה שתרשם/.test(t)) { status = "done"; note = "נרשם: למוח יש יכולות ביצוע חדשות (actions) שלא היו לפני"; }
    else if (META_SYSTEM.test(t)) { status = "done"; note = "מערכת השדרוגים נבנתה ופעילה ב-/learn/brain/upgrades"; }
    else if (DAILY_GEN.test(t)) { status = "in-progress"; note = "מימוש מתוכנן: cron יומי ב-01:00 שייצר פרומפט חדש על בסיס הקורפוס"; }
    else if (DEDUPE.test(t)) { status = "in-progress"; note = "מימוש מתוכנן: job שמשווה embeddings ומסמן כפילויות >85%"; }
    else if (ALREADY_BUILT_MARKERS.test(t)) { status = "done"; note = "כבר ממומש: compose_prompt משתמש ב-5 רפרנסים + 8 סעיפים + Knowledge Nodes"; }
    else if (ONE_SHOT.test(t)) { status = "rejected"; note = "בקשה חד-פעמית, לא שדרוג מערכת"; }
    else if (ASK_TOPIC.test(t) || /^אורן,\s/.test(t)) { status = "rejected"; note = "הודעה שיחתית של המוח, לא שדרוג"; }

    if (status) {
      await prisma.brainUpgradeRequest.update({
        where: { id: u.id },
        data: { status, claudeNotes: note, implementedAt: status === "done" ? new Date() : null },
      });
      updates++;
      if (status === "done") done++;
      else if (status === "rejected") rejected++;
      else kept++;
    } else {
      kept++;
    }
  }

  return NextResponse.json({ ok: true, scanned: pending.length, updates, done, rejected, inProgress: kept });
}
