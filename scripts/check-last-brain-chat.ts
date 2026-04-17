import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const chat = await p.brainChat.findFirst({ orderBy: { updatedAt: "desc" }, include: { messages: { orderBy: { createdAt: "desc" }, take: 10 } } });
  if (!chat) { console.log("no chat"); return; }
  console.log(`Chat: ${chat.id} · updated: ${chat.updatedAt.toISOString()}\n`);
  for (const m of chat.messages.reverse()) {
    const role = m.role === "user" ? "👤" : "🤖";
    console.log(`${role} ${m.createdAt.toISOString().slice(11, 19)}`);
    console.log(`   ${m.content.slice(0, 200).replace(/\n/g, " ")}\n`);
  }
  // Check scene logs
  const logs = await (p as any).sceneLog.findMany({
    orderBy: { createdAt: "desc" }, take: 10,
    select: { action: true, createdAt: true, sceneId: true, actorName: true, details: true },
  });
  console.log(`\nLatest 10 SceneLogs:`);
  for (const l of logs) {
    console.log(`  ${l.createdAt.toISOString().slice(11, 19)} · ${l.action} · ${l.actorName ?? "—"} · scene=${l.sceneId.slice(-8)}`);
  }
  await p.$disconnect();
})();
