/**
 * Fast single-extension test: take SC1's base video and extend by
 * ONLY 8 seconds (cheapest/fastest) to verify the Sora Extensions API
 * behavior and visual continuity. If this works well → scale up.
 *
 * Live progress printed every 20s (same style as other monitors).
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
if (!KEY) { console.error("OPENAI_API_KEY required"); process.exit(1); }

function log(m: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

const EXTENSION_SECONDS = "8"; // 4 / 8 / 12 / 16 / 20 — shortest for fastest feedback
const EXTENSION_PROMPT = "Continue seamlessly from the current moment. Maya stays in the same room, same lighting, same wardrobe. She takes a single calm step forward and turns her head slightly toward a luminous hallway to her left, a soft breath of curiosity passing across her face. Camera matches her pace in a gentle dolly-in, keeping her at over-the-shoulder distance. The scene ends on a cleanly composed still frame.";

(async () => {
  log("━━━ Sora Extension single test (8s) ━━━");

  // Pick SC1's primary
  const sc1 = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 } });
  if (!sc1) { log("SC1 not found"); return; }
  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: sc1.id, assetType: "VIDEO", status: "READY" },
    orderBy: { createdAt: "desc" }, take: 10,
  });
  const primary = assets.find((a) => (a.metadata as any)?.isPrimary) ?? assets[0];
  if (!primary) { log("no READY SC1 video"); return; }
  const baseId = (primary.metadata as any)?.soraVideoId ?? primary.fileUrl.match(/id=(video_[^&]+)/)?.[1];
  if (!baseId) { log("no soraVideoId"); return; }
  log(`base: ${baseId}`);
  log(`prompt preview: ${EXTENSION_PROMPT.slice(0, 140)}…`);

  // Submit extension
  log(`\nsubmitting /v1/videos/${baseId.slice(-12)}/extensions seconds=${EXTENSION_SECONDS}`);
  const r = await fetch(`https://api.openai.com/v1/videos/${baseId}/extensions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: EXTENSION_PROMPT, seconds: EXTENSION_SECONDS }),
  });
  const d: any = await r.json();
  if (!r.ok) { log(`❌ submit err: ${JSON.stringify(d).slice(0, 400)}`); return; }
  const jobId = d.id;
  log(`✓ submitted: ${jobId}`);
  log(`  queued/in_progress...`);

  // Poll + print progress every 20s
  const start = Date.now();
  let final: any = null;
  while (Date.now() - start < 20 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const r = await fetch(`https://api.openai.com/v1/videos/${jobId}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d: any = await r.json();
    const elapsed = Math.round((Date.now() - start) / 1000);
    log(`  [${elapsed}s] status=${d.status} progress=${d.progress ?? 0}%`);
    if (d.status === "completed") { final = d; break; }
    if (d.status === "failed" || d.status === "cancelled") {
      log(`❌ ${d.error?.code}: ${d.error?.message}`);
      return;
    }
  }
  if (!final) { log("timeout"); return; }

  log(`\n━━━ DONE ━━━`);
  const totalSec = 20 + parseInt(EXTENSION_SECONDS, 10);
  log(`final video: ${jobId}`);
  log(`total duration: ${totalSec}s (SC1 20s + ext ${EXTENSION_SECONDS}s)`);
  log(`proxy: https://vexo-studio.vercel.app/api/v1/videos/sora-proxy?id=${jobId}`);

  // Save asset
  const scWithProject = await p.scene.findUnique({
    where: { id: sc1.id },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  const projectId = scWithProject?.episode?.season?.series?.projectId;
  if (projectId) {
    await p.asset.create({
      data: {
        projectId,
        entityType: "SCENE",
        entityId: sc1.id,
        assetType: "VIDEO",
        fileUrl: `/api/v1/videos/sora-proxy?id=${encodeURIComponent(jobId)}`,
        mimeType: "video/mp4",
        status: "READY",
        durationSeconds: totalSec,
        metadata: {
          provider: "openai",
          model: "sora-2",
          soraVideoId: jobId,
          durationSeconds: totalSec,
          costUsd: +(parseInt(EXTENSION_SECONDS, 10) * 0.10).toFixed(2),
          kind: "sora-extended-test",
          chainLength: 1,
          baseSoraId: baseId,
        } as any,
      },
    });
    log(`✓ asset row created`);
  }

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
