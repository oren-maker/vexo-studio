import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCENE_ID = process.argv[2] || "cmo2ayw3d0001d2620skafbia";

(async () => {
  const scene = await p.scene.findUnique({
    where: { id: SCENE_ID },
    include: {
      episode: { select: { id: true, episodeNumber: true, title: true } },
    },
  });
  if (!scene) { console.log("❌ scene not found"); return; }
  const mem = (scene.memoryContext as any) ?? {};
  console.log(`━━━ SCENE ${scene.sceneNumber} · ${scene.id} ━━━`);
  console.log(`status: ${scene.status}`);
  console.log(`title: ${scene.title}`);
  console.log(`episode: EP${scene.episode?.episodeNumber} "${scene.episode?.title}"`);
  console.log(`scriptText len: ${scene.scriptText?.length || 0}`);
  console.log(`memoryContext.pendingVideoJob: ${JSON.stringify(mem.pendingVideoJob ?? null)}`);
  console.log(`memoryContext.lastVideoError: ${mem.lastVideoError ?? "(none)"}`);

  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: scene.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, assetType: true, status: true, fileUrl: true, createdAt: true, metadata: true },
  });
  console.log(`\n━━━ ASSETS (${assets.length}) ━━━`);
  for (const a of assets) {
    console.log(`  [${a.assetType}] ${a.status} · ${a.createdAt.toISOString().slice(0, 16)}`);
    console.log(`    url: ${a.fileUrl}`);
    if (a.metadata) console.log(`    meta: ${JSON.stringify(a.metadata).slice(0, 200)}`);
  }

  const logs = await (p as any).sceneLog.findMany({
    where: { sceneId: scene.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, actor: true, createdAt: true, details: true },
  });
  console.log(`\n━━━ RECENT LOGS (${logs.length}) ━━━`);
  for (const l of logs) {
    console.log(`  ${l.createdAt.toISOString().slice(11, 19)} · ${l.action} · ${l.actor}`);
    if (l.details) console.log(`    details: ${JSON.stringify(l.details).slice(0, 180)}`);
  }

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
