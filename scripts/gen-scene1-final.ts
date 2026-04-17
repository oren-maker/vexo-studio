import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const AUTH = "Key e2ca9f1f-a58e-40ce-b07e-79685643ae8c:80567f1f8feaf739754d3c122ded287ac791acb9f5164514d9b0ec091480fa2a";

(async () => {
  const s = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 } });
  if (!s?.scriptText) { console.error("no script"); return; }
  console.log(`Prompt: ${s.scriptText.length} chars\n`);

  const jobs: { label: string; id?: string; dur: number; cost: number }[] = [];

  // Kling 3.0 t2v (15s)
  try {
    const res = await fetch("https://platform.higgsfield.ai/kling-video/v3.0/pro/text-to-video", {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: s.scriptText.slice(0, 2000), duration: 15, aspect_ratio: "16:9", seed: 101 }),
    });
    const d: any = await res.json();
    jobs.push({ label: "Kling 3.0 (15s)", id: d.request_id, dur: 15, cost: 0.90 });
    console.log(`✓ Kling → ${d.request_id}`);
  } catch (e: any) { console.log(`✗ Kling: ${e.message}`); }

  // Seedance 1.5 t2v (12s)
  try {
    const res = await fetch("https://platform.higgsfield.ai/bytedance/seedance/v1.5/pro/text-to-video", {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: s.scriptText.slice(0, 2000), duration: 12, aspect_ratio: "16:9", seed: 101 }),
    });
    const d: any = await res.json();
    jobs.push({ label: "Seedance 1.5 (12s)", id: d.request_id, dur: 12, cost: 0.60 });
    console.log(`✓ Seedance → ${d.request_id}`);
  } catch (e: any) { console.log(`✗ Seedance: ${e.message}`); }

  // Poll
  console.log(`\nPolling ${jobs.length} jobs...`);
  const start = Date.now();
  const done = new Set<string>();
  while (done.size < jobs.filter((j) => j.id).length && Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 15_000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    for (const j of jobs) {
      if (!j.id || done.has(j.label)) continue;
      try {
        const r = await fetch(`https://platform.higgsfield.ai/requests/${j.id}/status`, { headers: { Authorization: AUTH } });
        const d: any = await r.json();
        if (d.status === "completed") {
          done.add(j.label);
          console.log(`[${elapsed}s] ✅ ${j.label} ($${j.cost}): ${d.video?.url ?? "(no url)"}`);
        } else if (d.status === "failed" || d.status === "nsfw") {
          done.add(j.label);
          console.log(`[${elapsed}s] ❌ ${j.label}: ${d.status}`);
        } else {
          console.log(`[${elapsed}s] ⏳ ${j.label}: ${d.status}`);
        }
      } catch {}
    }
  }
  await p.$disconnect();
})();
