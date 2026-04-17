/**
 * One-off cleanup: classify the pending BrainUpgradeRequest rows created by
 * the (too-broad) detectors and bulk-reject the obvious misfires. Leaves the
 * legitimate architectural upgrades alone so a human can review them.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  const items = await p.brainUpgradeRequest.findMany({
    where: { status: { in: ["pending", "in-progress"] } },
    orderBy: [{ createdAt: "desc" }],
  });
  console.log(`scanning ${items.length} rows...`);

  let rejBrainReply = 0;
  let rejProduction = 0;
  let rejDuplicate = 0;
  let kept = 0;
  const seenNorm = new Set<string>();

  for (const it of items) {
    const norm = it.instruction.slice(0, 120).replace(/\s+/g, " ").trim();

    // Duplicate of an earlier instruction
    if (seenNorm.has(norm)) {
      await p.brainUpgradeRequest.update({
        where: { id: it.id },
        data: { status: "rejected", claudeNotes: "duplicate — same instruction text already captured" },
      });
      rejDuplicate++;
      continue;
    }

    // Brain's own reply that got caught by the detector
    // (context="brain-suggestion" + opens like the brain's voice)
    const isBrainReply = it.context === "brain-suggestion" || /^(אורן|היי|אחלה|מצוין|הכנתי|הנה |קיבלתי|רשמתי|זה שדרוג|זה צעד|אני סורק|אני מציע|אני מאפס)/.test(it.instruction.trim());

    // Production chatter — scene/episode/series specific requests, NOT system upgrades
    const isProduction = /(סצנה|פרק|עונה|סדרה|דמות|פרומפט|סקריפט|תסריט|תסקור|תעדכן|תערוך|תשלח|תסדר|תרשום בשדרוגים|שיהיה לחיץ|בקישור|לא לחיץ|פייד אאוט|רחוב|חלון|חוף|וילה|מראות|ווילה|חדר)/.test(it.instruction);

    // Meta-chatter — user comments about how the upgrades system should work
    const isMetaChatter = /^(תרשום בשדרוגים|אתה לא צריך ש|אני רוצה שתייצר|אני רוצה שתערוך|אז מה אתה אומר|שיהיה מוכן|לא צריך)/.test(it.instruction.trim());

    if (isBrainReply) {
      await p.brainUpgradeRequest.update({
        where: { id: it.id },
        data: { status: "rejected", claudeNotes: "misclassified by detector — this was the brain's own reply, not a user instruction. Detector regex tightened in commit b8ed856." },
      });
      rejBrainReply++;
    } else if (isProduction || isMetaChatter) {
      await p.brainUpgradeRequest.update({
        where: { id: it.id },
        data: { status: "rejected", claudeNotes: "production/scene request, not a system upgrade — handled in chat. Detector regex tightened in commit b8ed856." },
      });
      rejProduction++;
    } else {
      kept++;
    }
    seenNorm.add(norm);
  }

  console.log(`DONE.
  rejected (brain reply): ${rejBrainReply}
  rejected (production):  ${rejProduction}
  rejected (duplicate):   ${rejDuplicate}
  kept for review:        ${kept}
  `);

  // Show what remains
  const remaining = await p.brainUpgradeRequest.findMany({
    where: { status: { in: ["pending", "in-progress"] } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
  console.log(`\nREMAINING (${remaining.length}):`);
  for (const it of remaining) {
    console.log(` · [${it.status}] p=${it.priority} #${it.id.slice(-6)} — ${it.instruction.slice(0, 120).replace(/\s+/g, " ")}`);
  }

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
