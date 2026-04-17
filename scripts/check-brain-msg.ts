import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const msg = await p.brainMessage.findFirst({ where: { role: "brain" }, orderBy: { createdAt: "desc" } });
  if (!msg) { console.log("no msg"); return; }
  console.log("length:", msg.content.length);
  console.log("has ```:", msg.content.includes("```"));
  console.log("has action:", /action/i.test(msg.content));
  console.log("has update_opening_prompt:", msg.content.includes("update_opening_prompt"));
  console.log("has type:", msg.content.includes('"type"'));
  console.log("\n--- LAST 1000 CHARS ---");
  console.log(msg.content.slice(-1000));
  await p.$disconnect();
})();
