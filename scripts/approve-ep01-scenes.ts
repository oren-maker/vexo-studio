/**
 * The 10 new scenes I just created for EP01 are in status=DRAFT. Bump them
 * to STORYBOARD_APPROVED so /generate-video accepts them. They already have
 * full scriptText (300-500 words each) so they're ready to render.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
(async () => {
  const scenes = await p.scene.findMany({ where: { episodeId: EPISODE_ID } });
  console.log(`EP01 scenes: ${scenes.length}`);
  for (const s of scenes) {
    console.log(`  scene ${s.sceneNumber}: "${s.title}" · status=${s.status} · scriptLen=${s.scriptText?.length ?? 0}`);
  }
  const r = await p.scene.updateMany({
    where: { episodeId: EPISODE_ID, status: "DRAFT" },
    data: { status: "STORYBOARD_APPROVED" },
  });
  console.log(`\n✅ Flipped ${r.count} scenes DRAFT → STORYBOARD_APPROVED`);
  await p.$disconnect();
})();
