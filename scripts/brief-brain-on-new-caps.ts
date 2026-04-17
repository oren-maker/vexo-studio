/**
 * Insert BrainReference rows for the capabilities we built 2026-04-17
 * so the AI Director sees them in its next chat context.
 *
 * Each capability is short+long description following the existing
 * patterns in the BrainReference table (kind="capability").
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const CAPS: Array<{ name: string; shortDesc: string; longDesc: string; tags: string[] }> = [
  {
    name: "חילוץ 4 פריימים אחרונים באישור סצנה",
    shortDesc: "כל אישור סצנה מחלץ אוטומטית 4 פריימים מהסוף (t-4s → t-1s) — האחרון משמש כ-i2v seed לסצנה הבאה.",
    longDesc: "מימוש 2026-04-17: הלחיצה על ' אשר סצנה' בעמוד הסצנה מפעילה pipeline של ffmpeg שמוריד את הוידאו הראשי (Sora/Kling), פותח 4 חלונות זמן של שנייה כל אחד (מ-4 שניות לפני הסוף ועד שנייה לפני הסוף), ובוחר מכל חלון את ה-keyframe הכי חד (filter: thumbnail + unsharp). ארבעת הפריימים נשמרים ב-Vercel Blob תחת bridge-frames/ ובמסד נתונים תחת scene.memoryContext.bridgeFrameUrls כמערך. הפריים האחרון (t-1s) נקבע כ-bridgeFrameUrl הקנוני ומועבר אוטומטית ל-seedImageUrl של הסצנה הבאה בפרק. שימוש: בעת יצירת וידאו לסצנה הבאה, ה-seedImageUrl מועבר ל-Sora/Kling כ-i2v reference — כך נשמרת זהות הדמויות, המיקום והאובייקטים בין הקליפים. עלות: $0.008 לחילוץ (4 × $0.002). נרשם CostEntry + SceneLog אוטומטית.",
    tags: ["וידאו", "continuity", "bridge", "i2v", "ffmpeg", "approve"],
  },
  {
    name: "נעילת סצנה באישור (State Lock)",
    shortDesc: "כש-scene.status = APPROVED כל כפתורי העריכה, יצירה מחדש, וטקסטים הופכים readonly. ביטול אישור משחרר.",
    longDesc: "מימוש 2026-04-17: המצב APPROVED נועל את כל הפעולות המוטציוניות בעמוד הסצנה: צור תשריט, צור וידאו, פירוק תסריט, מבקר AI, ייצר עם AI בדף הבמאי, ייצר עם AI בהערות סאונד, עריכת כותרת/תיאור, ייצר מחדש את כל המסגרות, ייצר מחדש פריים בודד, textarea של הערות במאי והערות סאונד (readOnly). אייקון 🔒 על הכותרת. כל הכפתורים מציגים tooltip 'הסצנה אושרה — לבטל אישור כדי לשנות'. כפתור 'ביטול אישור' (אדום) זמין ומחזיר את הסטטוס ל-VIDEO_REVIEW — ה-bridge frames נשמרים כי הם עבודה שכבר בוצעה. אחרי אישור/ביטול העמוד עושה hard refresh אוטומטי כדי שהמצב ייראה נכון מיד.",
    tags: ["וידאו", "scene", "state-machine", "approve", "UX"],
  },
  {
    name: "Sora Remix — פרומפט דלתא קצר בלבד",
    shortDesc: "רימיקס ב-Sora מקבל פרומפט קצר (< 1500 תווים) שמתאר רק את השינוי. פרומפט ארוך גורם ל-Sora להתעלם מהמקור.",
    longDesc: "מימוש 2026-04-17 אחרי מקרה חי: שליחה של פרומפט מלא (title card + HARD OVERRIDE + identity lock + original script + end-frame rules, ~2000 תווים) לנקודת הקצה /v1/videos/{id}/remix גרמה ל-Sora לייצר וידאו חדש שלא שמר שום פיקסל מהמקור. הפורמט הנכון: (א) שורה אחת preservation hint — 'Keep every unchanged element from the source video exactly'; (ב) אם המשתמש ביקש title card במפורש — הוספה ספציפית של 2 שניות בהתחלה; (ג) הערות המשתמש מילולית תחת 'CHANGES REQUESTED BY USER:'. סה''כ ≤ 1500 תווים, עם דגש מרבי על הערות המשתמש. ה-scriptText + director sheet + HARD OVERRIDE שייכים רק ל-generate-video (יצירה חדשה), לעולם לא ל-remix. הכלל הזה שמור גם בזיכרון של Claude (lesson_sora_remix_delta_only.md).",
    tags: ["וידאו", "remix", "sora", "prompt-engineering"],
  },
  {
    name: "פרומפט וידאו מורחב — continuity + אודיו עשיר + HARD OVERRIDE",
    shortDesc: "generate-video בונה פרומפט 5-שכבות: continuity header, title card (סצנה 1), HARD OVERRIDE נגד character grid, אודיו עשיר, identity+location+objects lock.",
    longDesc: "מימוש 2026-04-17 (שני סבבים). הפרומפט שנשלח ל-Sora/Kling/Seedance עבר refactor מלא: (1) CONTINUOUS TV SERIES header שמבהיר שזה קליפ בתוך רצף (לא וידאו בודד); (2) titleCardBlock בלעדי לסצנה 1 עם טיפוגרפיה מפורשת (Helvetica Bold 9%) + תזמון frame-by-frame (0-2s שחור עם טקסט, 2-2.5s fade, פעולה אחרי 2.5s) + voice-over; (3) noReferenceGridRule שאוסר על השימוש בתמונת דמויות כ-overlay בווידאו — פתרון לבאג שבו Sora טמעה את כרטיס הדמויות בוידאו עצמו; (4) AUDIO block עם 5 רצועות ממוספרות (DIALOGUE עם phoneme-level lip-sync, MUSIC עם -3-6dB ducking ו-1-3kHz gap, AMBIENCE רציף, FOLEY מפורט, scene-specific sound notes) + NEGATIVE RULES; (5) continuityLock — Characters / Location / Lighting / Props / Camera identical to reference. בנוסף יש sanitizer שמסנן שש תבניות regex בעייתיות מהטקסט של המוח (title fades in, lock identity to reference וכו') כדי למנוע את הבעיות הנ''ל. End-frame rule: fade-to-black רק בסצנה האחרונה של פרק (אחרת clean frame בשביל ה-bridge).",
    tags: ["וידאו", "prompt-engineering", "sora", "veo", "continuity"],
  },
  {
    name: "Daily brain-proposals cron",
    shortDesc: "כל יום ב-06:00 UTC המוח מייצר עד 3 הצעות שדרוג מבוססות על מצב הקורפוס — ממתינות לאישור משתמש.",
    longDesc: "מימוש 2026-04-17: /api/v1/learn/cron/brain-proposals רץ יומית ב-06:00 ומפיק עד 3 BrainUpgradeRequest עם context='daily-proposal'. כל הצעה מבוססת ניתוח אמיתי של המצב: (1) פרומפטים קצרים (< 300 מילים) שצריכים העשרה; (2) קבוצות כפילויות לפי תחילית טקסט זהה; (3) יחס KnowledgeNode/LearnSource נמוך (< 10:1). Dedup: לא יוצרת שוב הצעה עם אותה תחילית שכבר הופיעה ב-7 הימים האחרונים. הופך את המוח מ-reactive ל-proactive. תואם לבקשה הראשונית של אורן (BrainUpgradeRequest #xbepcw).",
    tags: ["brain", "cron", "proactive", "upgrades"],
  },
  {
    name: "Brain detector — rigorous regex (אין עוד ספאם)",
    shortDesc: "התבניות שמזהות הודעות שדרוג (משתמש + תגובות המוח) הוחמרו כדי לא לתפוס שיחה רגילה.",
    longDesc: "מימוש 2026-04-17 אחרי ניקוי של 40 רשומות ספאם מתוך 44 ב-BrainUpgradeRequest. הרגקסים הישנים היו רחבים מדי: 'שיהיה', 'תוסיף ש', 'הצעה', 'שדרוג', 'פיצ''ר' — כל שיחה על הפקת סצנה נתפסה כשדרוג. החדשים: SYSTEM_TARGET דורש ביטוי שמכוון למערכת באופן מפורש ('תשדרג את המוח/המערכת', 'שהמוח ידע/יסנן/יבדוק', 'מהיום והלאה המוח'), ונשלל אם יש מילות הפקה (סצנה/פרק/עונה/דמות). BRAIN_SYSTEM_PROPOSAL (לתגובות המוח) דורש 'אני מציע שנוסיף/נבנה יכולת במוח/במערכת' + שלילה אם התגובה מדברת על סצנה/דמות. התוצאה: רק שדרוגים אדריכלוגיים אמיתיים מגיעים לתור. pending queue עכשיו 0 אחרי ניקוי.",
    tags: ["brain", "regex", "upgrades", "noise-filter"],
  },
  {
    name: "Scene-level cost tracking (CostEntry מלא)",
    shortDesc: "כל פעולת AI/compute על סצנה (וידאו, רימיקס, bridge frame extraction, אישור) נרשמת אוטומטית ב-CostEntry.",
    longDesc: "מימוש 2026-04-17: אחרי שגיליתי פער של $8 בין ה-Assets הקיימים ל-CostEntry (סקריפטים ידניים עקפו את chargeUsd), הוספתי: (1) כל נתיב ה-approve קורא ל-chargeUsd עם תיאור מפורט + quantity + unitCost; (2) ה-finalize script מעדכן גם CostEntry ולא רק Asset; (3) backfill script אוטומטי שבודק asset.metadata.costUsd ומשווה ל-CostEntry, יוצר רשומות חסרות. UI עמוד הסצנה קורא מ-CostEntry (לא מ-metadata) ומציג 'עלות AI של הסצנה' עם פירוק לפי קטגוריה. שקיפות מלאה.",
    tags: ["cost", "tracking", "CostEntry", "scene"],
  },
];

(async () => {
  const existing = await p.brainReference.findMany({
    where: { kind: "capability" },
    select: { name: true, id: true },
  });
  const existingNames = new Set(existing.map((e) => e.name));

  let added = 0;
  let skipped = 0;
  const maxOrder = Math.max(0, ...existing.map(() => 0)); // fetch real max below
  const maxOrderRow = await p.brainReference.findFirst({
    where: { kind: "capability" },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  let nextOrder = (maxOrderRow?.order ?? 0) + 1;

  for (const cap of CAPS) {
    if (existingNames.has(cap.name)) {
      console.log(`  ↷ skipped (exists): ${cap.name}`);
      skipped++;
      continue;
    }
    await p.brainReference.create({
      data: {
        kind: "capability",
        name: cap.name,
        shortDesc: cap.shortDesc,
        longDesc: cap.longDesc,
        tags: cap.tags,
        order: nextOrder,
      },
    });
    console.log(`  + added: ${cap.name}`);
    nextOrder++;
    added++;
  }

  const total = await p.brainReference.count({ where: { kind: "capability" } });
  console.log(`\n${added} added · ${skipped} skipped · total capabilities now: ${total}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
