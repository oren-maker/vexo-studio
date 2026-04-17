/**
 * Add a BrainReference capability + a KnowledgeNode documenting the
 * Sora moderation insight learned during SC9's 3-retry saga:
 * keyword sanitization isn't enough — atmosphere/tone matters.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  // 1) Add capability to BrainReference
  const existing = await p.brainReference.findFirst({
    where: { kind: "capability", name: { contains: "Sora moderation" } },
  });
  if (existing) {
    console.log(`ℹ capability exists (${existing.id.slice(-8)}) — updating longDesc`);
    await p.brainReference.update({
      where: { id: existing.id },
      data: {
        shortDesc: "Sora חוסמת לא רק על keywords אלא על אווירה/טון. שכתוב 'רך' (curiosity במקום dread) — הפתרון בסצנה שנחסמה.",
        longDesc: LONG_DESC,
        tags: ["וידאו", "sora", "moderation", "prompt-engineering", "lesson"],
        version: existing.version + 1,
        updatedAt: new Date(),
      },
    });
  } else {
    const maxOrderRow = await p.brainReference.findFirst({
      where: { kind: "capability" }, orderBy: { order: "desc" }, select: { order: true },
    });
    const nextOrder = (maxOrderRow?.order ?? 0) + 1;
    await p.brainReference.create({
      data: {
        kind: "capability",
        name: "Sora moderation — חוסמת אווירה, לא רק מילים",
        shortDesc: "Sora חוסמת לא רק על keywords אלא על אווירה/טון. שכתוב 'רך' (curiosity במקום dread) — הפתרון בסצנה שנחסמה.",
        longDesc: LONG_DESC,
        tags: ["וידאו", "sora", "moderation", "prompt-engineering", "lesson"],
        order: nextOrder,
      },
    });
    console.log(`✓ added new capability (order ${nextOrder})`);
  }

  // 2) KnowledgeNode requires an analysisId link — skipping (the capability
  // entry above already covers the insight in the director's RAG).

  const total = await p.brainReference.count({ where: { kind: "capability" } });
  const nodes = await p.knowledgeNode.count();
  console.log(`\ntotal capabilities: ${total} · total knowledge nodes: ${nodes}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });

const LONG_DESC = `תובנה שנרשמה 2026-04-18 אחרי חסימה משולשת של SC9 (Echoes of Tomorrow):

**הבעיה:** Sora's moderation חסמה את הסצנה שלוש פעמים ברצף ב-99% progress — גם אחרי שה-sanitizer הסיר את כל ה-keywords מהרשימה הידועה (paranoid, soldier, thriller, violence וכו').

**השורש האמיתי:** Sora's content filter בוחן **את כל האווירה של הפרומפט** לא רק מילים בודדות. סצנה שהיא "psychological thriller + simulation reveal + cold determination + dark basement + shock-reaction" תיחסם גם אם כל המילים 'בטוחות' לכאורה.

**הפתרון שעבד (רישיון הבמאי):** שכתוב 'רך' של הרגש:
- "dread / terror / shock" → "curiosity / wonder / gentle realization"
- "cold, hard determination" → "calm understanding / quiet awakening"
- "dark basement / shadow" → "luminous hall / quiet study / gallery"
- "soldier / military / combat" → "artist / teacher / dancer / writer / scholar"
- "identity crisis / fractured self" → "discovery / self-recognition"

**מתי להחיל:**
1. סצנה שנחסמה פעם ראשונה → הרץ sanitizer (הרשימה הרחבה של 28+ triggers ב-feedback_sora_moderation).
2. אם נחסמה שוב — **עצור, אל תשלח שוב**. שכתוב את הטון.
3. בקש מהבמאי (Gemini) לשכתב עם הנחיה מפורשת: "keep narrative beat, soften emotional register, avoid atmosphere categories A/B/C".
4. שלח מחדש — בדרך כלל עובר בניסיון הראשון אחרי שכתוב.

**מתייחס גם ל:** lesson_sora_remix_delta_only, feedback_sora_moderation.

**דוגמה ממקרה אמיתי (SC9 'The Multiverse Wall'):**
- לפני: "Maya stands at foot of dark basement stairs, shimmering reality-fractures, screens show doctor/soldier/mother, her expression shifts from shock to cold hard determination"
- אחרי (עבר): "Maya in a luminous gallery, softly-glowing mirror wall shows variations of her life as artist/teacher/dancer, her face breaks into quiet understanding"`;
