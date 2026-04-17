import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCENE_ID = process.argv[2];
(async () => {
  const s = await p.scene.findUnique({ where: { id: SCENE_ID }, select: { sceneNumber: true, title: true, summary: true, scriptText: true, memoryContext: true } });
  if (!s) { console.error("not found"); return; }
  console.log(`━━━ SCENE ${s.sceneNumber} · ${s.title}`);
  console.log(`\n━━━ summary:\n${s.summary}`);
  console.log(`\n━━━ scriptText (${s.scriptText?.length || 0} chars):\n${s.scriptText}`);
  const mem: any = s.memoryContext ?? {};
  console.log(`\n━━━ directorSheet:`);
  for (const [k, v] of Object.entries(mem.directorSheet ?? {})) console.log(`  ${k}: ${String(v).slice(0, 200)}`);
  console.log(`\n━━━ directorNotes:\n${mem.directorNotes ?? "(none)"}`);
  console.log(`\n━━━ soundNotes:\n${(mem.soundNotes ?? "").slice(0, 400)}`);
  await p.$disconnect();
})().catch((e) => console.error("ERR:", e.message));
