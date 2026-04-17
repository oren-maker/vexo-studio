import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const s = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 2 } });
  if (!s) return;
  const mem: any = s.memoryContext ?? {};
  console.log("id:", s.id);
  console.log("status:", s.status);
  console.log("lastVideoError:", mem.lastVideoError ?? "(none)");
  console.log("pendingVideoJob:", JSON.stringify(mem.pendingVideoJob ?? null));
  console.log("directorSheet:", !!mem.directorSheet);
  const logs = await (p as any).sceneLog.findMany({ where: { sceneId: s.id }, orderBy: { createdAt: "desc" }, take: 5 });
  console.log("logs:", logs.length);
  for (const l of logs) console.log("  " + l.action + " · " + l.createdAt.toISOString().slice(11, 19) + " · " + JSON.stringify(l.details ?? {}).slice(0, 100));
  await p.$disconnect();
})();
