/**
 * 1. Regenerate the SeasonOpening for S1 using its currentPrompt.
 * 2. Wait for Sora to finish, update the DB row.
 * 3. Delete the merged-episode Asset + Blob I created in the previous run.
 * 4. Print the new opening URL.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
if (!KEY) { console.error("OPENAI_API_KEY required"); process.exit(1); }

function log(m: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

(async () => {
  // ── STEP A: find the opening
  const opening = await p.seasonOpening.findFirst({ where: { isSeriesDefault: true } });
  if (!opening) { log("no default opening"); return; }
  log(`opening: ${opening.id} · model=${opening.model} · duration=${opening.duration}s · prompt=${opening.currentPrompt?.length} chars`);

  // ── STEP B: submit fresh Sora job
  const prompt = opening.currentPrompt ?? "";
  const model: any = opening.model ?? "sora-2";
  const seconds = String(Math.min(opening.duration ?? 20, 20)) as any;
  const size = (opening.aspectRatio === "9:16" ? "720x1280" : "1280x720") as any;

  log(`submitting fresh Sora job: model=${model} seconds=${seconds} size=${size}`);
  const form = new FormData();
  form.append("model", model);
  form.append("seconds", seconds);
  form.append("size", size);
  form.append("prompt", prompt.slice(0, 2000));
  const sora = await fetch("https://api.openai.com/v1/videos", { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form });
  const sdata: any = await sora.json();
  if (!sora.ok) { log(`Sora err: ${JSON.stringify(sdata).slice(0, 300)}`); return; }
  const jobId = sdata.id;
  log(`  ✓ submitted: ${jobId}`);

  await p.seasonOpening.update({
    where: { id: opening.id },
    data: { status: "GENERATING", falRequestId: jobId },
  });

  // ── STEP C: poll until completed
  const start = Date.now();
  let final: any = null;
  while (Date.now() - start < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const r = await fetch(`https://api.openai.com/v1/videos/${jobId}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d: any = await r.json();
    log(`  [${jobId.slice(-12)}] ${d.status} ${d.progress ?? 0}%`);
    if (d.status === "completed") { final = d; break; }
    if (d.status === "failed" || d.status === "cancelled") {
      log(`  ❌ ${d.error?.code}: ${d.error?.message}`);
      await p.seasonOpening.update({ where: { id: opening.id }, data: { status: "FAILED" } });
      return;
    }
  }
  if (!final) { log("timeout"); return; }

  // ── STEP D: update DB row
  const newProxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(jobId)}`;
  await p.seasonOpening.update({
    where: { id: opening.id },
    data: {
      status: "READY",
      videoUri: jobId,
      videoUrl: newProxyUrl,
      falRequestId: jobId,
      chunkVideoIds: [jobId] as any,
      updatedAt: new Date(),
    },
  });
  log(`  ✓ SeasonOpening updated → READY · videoUri=${jobId}`);

  // ── STEP E: delete the old merged-episode asset + blob
  const mergedAssets = await p.asset.findMany({
    where: { entityType: "EPISODE", assetType: "VIDEO" },
    select: { id: true, fileUrl: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const { del } = await import("@vercel/blob");
  for (const a of mergedAssets) {
    const m: any = a.metadata ?? {};
    if (m.kind !== "merged-episode") continue;
    log(`  deleting merged-episode asset ${a.id.slice(-8)} + blob`);
    try { await del(a.fileUrl); } catch (e: any) { log(`    blob del err: ${e.message?.slice(0, 100)}`); }
    await p.asset.delete({ where: { id: a.id } });
    log(`    ✓ deleted`);
  }

  log(`\n━━━ DONE ━━━`);
  log(`new opening: https://vexo-studio.vercel.app${newProxyUrl}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
