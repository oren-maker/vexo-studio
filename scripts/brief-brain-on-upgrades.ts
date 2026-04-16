import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Comprehensive summary of everything we built recently so the brain knows
// what capabilities and changes exist. Lands as a BrainUpgradeRequest(done) —
// these feed into /learn/brain/upgrades + are surfaced to the brain via
// past chats + buildSystemPrompt capability lookups.

const INSTRUCTION = "סיכום כל השדרוגים שעשינו בסבב זה — Oren + Claude";

const CONTEXT_BRIEFING = `סיכום השדרוגים האחרונים למוח ולמערכת (מה לדעת עליו לפני שמדברים):

━━━━━━━━━━━━━━━━━━━━ זיכרון ומדריכים ━━━━━━━━━━━━━━━━━━━━
• /learn/sources → "🧠 זיכרון" עם 2 טאבים עליונים: 📝 פרומפטים · 📖 מדריכים (מחליף את דף המדריכים הנפרד)
• /learn/sources/new → 3 טאבים (Instagram / Upload / URL). בטאב URL בוחרים בין "פרומפט" (pipeline) או "מדריך" (scraper)
• slug-ים תמיד אנגלית (עברית/ערבית נחתכת, fallback "guide")
• 34 מדריכים יובאו מ-claude-school-nu 1:1 עם תיקון parser (לא דולף יותר Next.js JS)
• דף מדריך בודד: 2 עמודות עם TOC sticky משמאל + scroll-spy, קטגוריה pill למעלה, metadata strip, ⭐ דירוג, 📥 כפתור PDF (browser print)
• StageRenderer תומך ב-markdown: \`\`\`code fences\`\`\` עם language label + כפתור העתקה, **bold**, bullet lists
• Dashboard במדריכים: 5 כרטיסי סטט (סה״כ · שלבים · עם cover · צפיות · דירוג) + פירוט מקור

━━━━━━━━━━━━━━━━━━━━ ידע (RAG) ━━━━━━━━━━━━━━━━━━━━
• /learn/knowledge מחולק ל-5 טאבים: 🧠 Knowledge · 😊 רגשות (25) · 🔊 סאונד (20) · 🎥 צילום (20) · ⚙️ יכולות (24)
• טבלת BrainReference חדשה (kind: emotion / sound / cinematography / capability). CRUD מלא עם ReferenceManager
• המוח קורא בכל שיחה את כל 89+ הפריטים (shortDesc בלבד לחסכון בטוקנים)
• פעולה חדשה: update_reference — המוח יכול לשדרג longDesc דרך action block

━━━━━━━━━━━━━━━━━━━━ מחולל פרומפטים ━━━━━━━━━━━━━━━━━━━━
• /learn/compose עם פס התקדמות חי (5% → 100%) עם תוויות שלבים (מושך דומים / Gemini מנתח / מרכיב Visual Style / כותב Timeline / מסיים)
• אחרי שמירה: פאנל ירוק בולט עם "👁 צפה בפרומפט" + "לכל הזיכרון" + "🔄 חולל חדש"

━━━━━━━━━━━━━━━━━━━━ העשרת מדריכים עם Gemini ━━━━━━━━━━━━━━━━━━━━
• /learn/guides/enrich — UI עם טבלת סטטוס, overall progress bar, start/stop, ✨ per-row single-enrich
• POST /api/v1/learn/guides/[slug]/enrich — Gemini מקבל כותרת+תיאור+ראשי סעיפים → בונה מחדש 6-10 שלבים, 200-400 מילים, עם code fences כשרלוונטי
• Source של מדריך שהועשר: "<original>+enriched"

━━━━━━━━━━━━━━━━━━━━ שיחה עם המוח ━━━━━━━━━━━━━━━━━━━━
• בועת צ'אט 🎬 מתמידה chatId ב-localStorage ("vexo-brain-chatId"), טוענת היסטוריה בעליה
• בועה מזהה את הדף הנוכחי (פרק/סצנה/דמות/מדריך/מקור) ומציגה "📍 אתה נמצא ב-X" מתחת לכותרת
• המוח מקבל pageContext ב-body של כל POST ומזריק ל-system prompt (עם lookup של פרטי הפריט מה-DB)
• חוק חדש לברירת מחדל: אם אורן אומר "הסצנה הזו" — המוח בודק ב-pageContext, ואם לא ודאי — שואל

━━━━━━━━━━━━━━━━━━━━ אוטומציות ━━━━━━━━━━━━━━━━━━━━
• Daily-learn cron (06:00 UTC): 5 שלבים → series-sync · brain-refresh · insights-snapshot · consciousness-report · auto-improve
• Series-sync מחשב delta מול הסנכרון הקודם (ב-attachDeltaToLatest) ושומר ב-InsightsSnapshot
• /learn/brain/upgrades — כל הוראה אופרטיבית בצ'אט נשמרת כ-BrainUpgradeRequest (pending → done)

━━━━━━━━━━━━━━━━━━━━ UI nav ━━━━━━━━━━━━━━━━━━━━
• Sidebar נקי: "הוסף מקור" הוסר (כבר בתוך זיכרון)
• כפתור "העשר הכל עם Gemini" בדף המדריכים
• Print CSS גלובלי: @media print מסתיר aside/nav/buttons, מסך לבן לטקסט שחור, section break-avoid`;

async function main() {
  const existing = await prisma.brainUpgradeRequest.findFirst({
    where: { instruction: INSTRUCTION },
  });
  if (existing) {
    await prisma.brainUpgradeRequest.update({
      where: { id: existing.id },
      data: {
        context: CONTEXT_BRIEFING,
        status: "done",
        priority: 1,
        claudeNotes: "תוכן סיכומי מתעדכן אחרי כל סבב שדרוגים גדול.",
        implementedAt: new Date(),
      },
    });
    console.log(`[brief-brain] updated existing briefing id=${existing.id}`);
  } else {
    const created = await prisma.brainUpgradeRequest.create({
      data: {
        instruction: INSTRUCTION,
        context: CONTEXT_BRIEFING,
        status: "done",
        priority: 1,
        claudeNotes: "תקציר ראשון של כל השדרוגים בסבב Claude School + זיכרון + העשרה.",
        implementedAt: new Date(),
      },
    });
    console.log(`[brief-brain] created briefing id=${created.id}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
