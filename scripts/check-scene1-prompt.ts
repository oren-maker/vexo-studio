import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const s = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 } });
  if (!s) { console.log("no scene"); return; }
  console.log("title:", s.title);
  console.log("summary:", s.summary);
  console.log("scriptText length:", s.scriptText?.length);
  console.log("\n--- scriptText (first 600) ---");
  console.log(s.scriptText?.slice(0, 600));
  const mem: any = s.memoryContext ?? {};
  console.log("\ncharacters:", mem.characters);
  console.log("directorNotes:", mem.directorNotes?.slice(0, 300) ?? "(none)");
  await p.$disconnect();
})();
