/**
 * Read the current saved opening prompt and submit it FRESH to Sora.
 * Updates SeasonOpening with the new falRequestId and clears the previous
 * FAILED state. Then waits for completion + auto-attaches asset.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";

(async () => {
  const o = await p.seasonOpening.findFirst({
    where: { season: { series: { title: "Echoes of Tomorrow" } } },
    include: { season: { include: { series: true } } },
  });
  if (!o) { console.error("opening not found"); return; }
  console.log("submitting prompt (" + o.currentPrompt.length + " chars) to Sora...");

  const r = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "sora-2", prompt: o.currentPrompt, seconds: "20", size: "1280x720" }),
  });
  const d: any = await r.json();
  if (!r.ok) { console.error("submit failed:", JSON.stringify(d).slice(0, 400)); return; }
  const videoId = d.id;
  console.log("✓ submitted: " + videoId);

  // Update opening — clear FAILED state, set new falRequestId
  await p.seasonOpening.update({
    where: { id: o.id },
    data: {
      status: "GENERATING",
      falRequestId: videoId,
      videoUri: null,
      videoUrl: null,
      provider: "openai",
      chunkVideoIds: [videoId] as any,
      chunkIndex: 0,
      chunkPrompts: [o.currentPrompt] as any,
    },
  });

  // Poll
  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 25_000));
    const r = await fetch(`https://api.openai.com/v1/videos/${videoId}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d: any = await r.json();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[${elapsed}s] status=${d.status} progress=${d.progress ?? 0}%`);
    if (d.status === "completed") {
      const fileUrl = `/api/v1/videos/sora-proxy?id=${videoId}`;
      await p.asset.create({
        data: {
          projectId: o.season.series.projectId,
          entityType: "SEASON_OPENING",
          entityId: o.id,
          assetType: "VIDEO",
          fileUrl, mimeType: "video/mp4", status: "READY", durationSeconds: 20,
          metadata: { provider: "openai-sora", model: "sora-2", soraVideoId: videoId, costUsd: 2.0, kind: "elegant-clean-no-anomaly" } as any,
        },
      });
      await p.seasonOpening.update({
        where: { id: o.id },
        data: { status: "READY", videoUrl: fileUrl, videoUri: videoId },
      });
      console.log("✅ READY → " + fileUrl);
      break;
    }
    if (d.status === "failed") {
      const errMsg = d.error?.message ?? "Sora failed";
      await p.seasonOpening.update({
        where: { id: o.id },
        data: { status: "FAILED", videoUri: `ERROR:${errMsg}` },
      });
      console.error("❌ Sora failed: " + errMsg);
      break;
    }
  }
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
