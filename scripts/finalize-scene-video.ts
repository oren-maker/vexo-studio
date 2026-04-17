/**
 * Finalize a scene video when the server-side polling missed the completion
 * (usually because the user refreshed the page and killed the client poll).
 * Pulls the scene's pendingVideoJob, verifies it's completed at OpenAI,
 * and closes the loop: creates Asset, flips status, writes SceneLog.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const SCENE_ID = process.argv[2];
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
if (!SCENE_ID) { console.error("usage: finalize-scene-video.ts <sceneId>"); process.exit(1); }
if (!KEY) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

(async () => {
  const scene = await p.scene.findUnique({
    where: { id: SCENE_ID },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  if (!scene) { console.error("scene not found"); return; }

  const mem: any = scene.memoryContext ?? {};
  const job = mem.pendingVideoJob;
  if (!job?.jobId) { console.error("no pendingVideoJob on scene"); return; }
  console.log(`job: ${job.jobId} (${job.model})`);

  const res = await fetch(`https://api.openai.com/v1/videos/${job.jobId}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const r: any = await res.json();
  if (!res.ok) { console.error("OpenAI error:", r); return; }
  console.log(`OpenAI status: ${r.status} · progress: ${r.progress}`);

  if (r.status !== "completed") {
    console.log("not completed — nothing to finalize");
    return;
  }

  const projectId = scene.episode?.season?.series?.projectId;
  if (!projectId) { console.error("no projectId on scene → episode → season → series"); return; }

  const proxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(job.jobId)}`;

  const asset = await p.asset.create({
    data: {
      projectId,
      entityType: "SCENE",
      entityId: scene.id,
      assetType: "VIDEO",
      fileUrl: proxyUrl,
      mimeType: "video/mp4",
      status: "READY",
      metadata: {
        provider: "openai",
        model: job.model,
        durationSeconds: job.durationSeconds ?? 20,
        soraVideoId: job.jobId,
        costUsd: job.model === "sora-2-pro" ? 6 : 2,
      } as any,
    },
  });
  console.log(`✓ created asset ${asset.id} → ${proxyUrl}`);

  const { pendingVideoJob: _, lastVideoError: __, ...rest } = mem;
  await p.scene.update({
    where: { id: scene.id },
    data: { status: "VIDEO_REVIEW", memoryContext: rest as any },
  });
  console.log(`✓ scene status: VIDEO_GENERATING → VIDEO_REVIEW, pending cleared`);

  await (p as any).sceneLog.create({
    data: {
      sceneId: scene.id,
      action: "video_ready",
      actor: "system:finalize-script",
      actorName: "Finalizer (manual close)",
      details: {
        jobId: job.jobId,
        model: job.model,
        durationSeconds: job.durationSeconds ?? 20,
        provider: "openai",
        note: "finalized via script because client polling was interrupted (page refresh)",
      },
    },
  }).catch(() => {});

  console.log(`\n✅ scene unblocked — refresh the page`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
