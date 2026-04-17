import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCENE_ID = process.argv[2];
if (!SCENE_ID) { console.error("usage: unblock-scene.ts <sceneId>"); process.exit(1); }

(async () => {
  const scene = await p.scene.findUnique({ where: { id: SCENE_ID } });
  if (!scene) { console.log("❌ not found"); return; }
  const mem: any = scene.memoryContext ?? {};
  const { pendingVideoJob, lastVideoError, ...rest } = mem;
  console.log(`before: status=${scene.status} pending=${!!pendingVideoJob} err=${lastVideoError ?? "-"}`);

  const hasReadyVideo = await p.asset.findFirst({
    where: { entityType: "SCENE", entityId: scene.id, assetType: "VIDEO", status: "READY" },
  });
  const newStatus = hasReadyVideo ? "VIDEO_REVIEW" : "STORYBOARD_APPROVED";

  await p.scene.update({
    where: { id: scene.id },
    data: { status: newStatus, memoryContext: rest as any },
  });

  console.log(`after:  status=${newStatus} pending=false err=cleared`);
  console.log(`  (${hasReadyVideo ? "has READY asset — opened for review" : "no ready asset — back to STORYBOARD_APPROVED for retry"})`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
