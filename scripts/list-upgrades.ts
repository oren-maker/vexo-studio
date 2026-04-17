import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const items = await p.brainUpgradeRequest.findMany({
    where: { status: { in: ["pending", "in-progress"] } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
  console.log(`FOUND ${items.length} upgrades (pending/in-progress):\n`);
  for (const it of items) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[${it.status.toUpperCase()}] #${it.id.slice(-6)} · p=${it.priority} · ${it.createdAt.toISOString().slice(0, 16)}`);
    console.log(`INSTRUCTION: ${it.instruction.slice(0, 400)}`);
    if (it.context) console.log(`CONTEXT: ${it.context.slice(0, 200)}`);
    if (it.claudeNotes) console.log(`PRIOR NOTES: ${it.claudeNotes.slice(0, 200)}`);
    console.log("");
  }
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
