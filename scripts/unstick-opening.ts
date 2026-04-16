/**
 * Flip a DRAFT opening that has an in-flight falRequestId back to GENERATING
 * so the GET-side poll loop actually picks it up.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const OPENING_ID = "cmnzgpsu1000511asr87f093i";
(async () => {
  const o = await p.seasonOpening.findUnique({ where: { id: OPENING_ID } });
  if (!o) { console.error("not found"); process.exit(1); }
  if (!o.falRequestId) { console.error("no falRequestId — nothing to resume"); process.exit(1); }
  console.log(`before: status=${o.status} falRequestId=${o.falRequestId}`);
  await p.seasonOpening.update({ where: { id: o.id }, data: { status: "GENERATING" } });
  console.log(`✅ flipped to GENERATING — next GET on /seasons/${o.seasonId} will poll Sora and flip to READY.`);
  await p.$disconnect();
})();
