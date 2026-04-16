import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const all = await p.brainUpgradeRequest.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: { id: true, status: true, priority: true, instruction: true, context: true, claudeNotes: true, createdAt: true, implementedAt: true },
  });
  const byStatus: Record<string, number> = {};
  for (const u of all) byStatus[u.status] = (byStatus[u.status] || 0) + 1;
  console.log(`Total: ${all.length} | ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(" · ")}\n`);
  for (const u of all) {
    const icon = u.status === "done" ? "✅" : u.status === "in-progress" ? "🔄" : u.status === "rejected" ? "✗" : "⏳";
    console.log(`${icon} [${u.priority}] id=${u.id} ${u.status} · ${new Date(u.createdAt).toISOString().slice(0, 10)}`);
    console.log(`   ${u.instruction.slice(0, 200).replace(/\s+/g, " ")}`);
    if (u.context) console.log(`   CTX: ${u.context.slice(0, 200).replace(/\s+/g, " ")}`);
    if (u.claudeNotes) console.log(`   NOTES: ${u.claudeNotes.slice(0, 200).replace(/\s+/g, " ")}`);
    console.log("");
  }
  await p.$disconnect();
})();
