import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const updates: Array<{ suffix: string; notes: string }> = [
  {
    suffix: "xbepcw",
    notes: "Implemented 2026-04-17 (commit c477d9f). /api/v1/learn/cron/brain-proposals ported from vexo-learn, scheduled daily at 06:00 UTC via vercel.json. Emits up to 3 corpus-based upgrade proposals per day (short-prompt enrichment, dedupe, node-coverage). Dedup'd against last 7 days.",
  },
  {
    suffix: "7bjeiu",
    notes: "Implemented 2026-04-17 (commit c477d9f). Added rule #4 to brain system prompt: before update_scene / compose_prompt, the brain must keep location + characters + scriptText coherent; partial updates that break continuity are forbidden.",
  },
  {
    suffix: "b1vhs5",
    notes: "Already implemented. The execute route has create_episode + create_scene + update_scene action handlers. Brain can create series/episodes/scenes autonomously via action blocks the user approves.",
  },
  {
    suffix: "trjj5t",
    notes: "Already covered by system prompt rule #2: vexo-studio.vercel.app is the only allowed domain; vexo-learn.vercel.app and localhost explicitly forbidden.",
  },
];

(async () => {
  for (const u of updates) {
    const rows = await p.brainUpgradeRequest.findMany({
      where: { id: { endsWith: u.suffix }, status: { in: ["pending", "in-progress"] } },
    });
    for (const row of rows) {
      await p.brainUpgradeRequest.update({
        where: { id: row.id },
        data: { status: "done", implementedAt: new Date(), claudeNotes: u.notes },
      });
      console.log(`  marked done: ${row.id.slice(-6)}`);
    }
  }
  const remaining = await p.brainUpgradeRequest.count({ where: { status: { in: ["pending", "in-progress"] } } });
  console.log(`\nremaining pending/in-progress: ${remaining}`);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
