import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const chat = await p.brainChat.findFirst({
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!chat) { console.log("no chats"); return; }
  console.log(`=== Chat ${chat.id} (${chat.title}) ===`);
  console.log(`Updated: ${chat.updatedAt.toISOString()}`);
  console.log(`Messages: ${chat.messages.length}\n`);

  // Look at the last 6 messages
  for (const m of chat.messages.slice(-6)) {
    console.log(`--- ${m.role} @ ${m.createdAt.toISOString()} ---`);
    console.log(m.content.slice(0, 800));
    console.log();
  }

  // Did any sources get created from this chat (looking for brain-chat addedBy)?
  const sources = await p.learnSource.findMany({
    where: { addedBy: { startsWith: "brain-chat" } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, addedBy: true, createdAt: true, status: true },
  });
  console.log(`\n=== Last 5 brain-chat sources ===`);
  for (const s of sources) {
    console.log(`${s.createdAt.toISOString()} · ${s.id} · status=${s.status} · ${s.addedBy} · ${s.title?.slice(0, 60)}`);
  }

  await p.$disconnect();
})();
