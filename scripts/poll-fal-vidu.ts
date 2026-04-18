/**
 * Continue polling the existing fal Vidu Q1 request and attach when complete.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const FAL_KEY = process.env.FAL_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";
const REQ = "019d9e7a-f156-7a63-b4cd-11f7cfcd0048";

(async () => {
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 15_000));
    let sd: any = null;
    try {
      const sr = await fetch(`https://queue.fal.run/fal-ai/vidu/q1/requests/${REQ}/status?logs=1`, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      const txt = await sr.text();
      try { sd = JSON.parse(txt); } catch { console.log(`[non-json] http=${sr.status} body=${txt.slice(0, 200)}`); continue; }
    } catch (e: any) { console.log(`fetch err: ${e.message}`); continue; }
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[${elapsed}s] status=${sd.status} queue_position=${sd.queue_position ?? "-"}`);
    if (sd.status === "COMPLETED") {
      const rr = await fetch(`https://queue.fal.run/fal-ai/vidu/q1/requests/${REQ}`, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      const rd: any = await rr.json();
      const videoUrl = rd?.video?.url ?? rd?.output?.video?.url ?? null;
      if (!videoUrl) { console.error("no video url in result:", JSON.stringify(rd).slice(0, 400)); break; }
      console.log("✓ COMPLETED. videoUrl=" + videoUrl);
      const o = await p.seasonOpening.findFirst({
        where: { season: { series: { title: "Echoes of Tomorrow" } } },
        include: { season: { include: { series: true } } },
      });
      if (!o) break;
      await p.asset.create({
        data: {
          projectId: o.season.series.projectId,
          entityType: "SEASON_OPENING", entityId: o.id, assetType: "VIDEO",
          fileUrl: videoUrl, mimeType: "video/mp4", status: "READY", durationSeconds: 8,
          metadata: { provider: "fal", model: "vidu-q1", costUsd: 0.64, kind: "vidu-cast-opening", refCount: 4, falRequestId: REQ } as any,
        },
      });
      await p.seasonOpening.update({
        where: { id: o.id },
        data: { status: "READY", videoUrl, videoUri: REQ },
      });
      console.log("✅ READY. opening flipped.");
      break;
    }
    if (sd.status === "ERROR" || sd.status === "FAILED") {
      console.error("❌ fal failed:", JSON.stringify(sd).slice(0, 400));
      break;
    }
  }
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
