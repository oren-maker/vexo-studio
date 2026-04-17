import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  await (p as any).sceneLog.create({
    data: {
      sceneId: "cmo1lzrhf00018kuzpsm215va",
      action: "brain_execute_update_scene",
      actor: "ai:brain",
      actorName: "במאי AI",
      details: { actionType: "update_scene", resultText: "עדכנתי סצנה 1 — The Mirror Slip · כניסה מרחוב לבית ואז הסצנה מתחילה" },
      createdAt: new Date("2026-04-17T00:56:28Z"),
    },
  });
  console.log("✅ backfilled brain execute log");
  await p.$disconnect();
})();
