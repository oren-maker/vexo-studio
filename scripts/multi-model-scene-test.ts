/**
 * Generate scene 1 "The Mirror Slip" on ALL Higgsfield t2v models.
 * Uses Gemini to craft a detailed 60s cinematic prompt, then submits
 * to each model at its max duration. Polls all until done.
 */

const HIGGS_AUTH = `Key e2ca9f1f-a58e-40ce-b07e-79685643ae8c:80567f1f8feaf739754d3c122ded287ac791acb9f5164514d9b0ec091480fa2a`;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const BASE = "https://platform.higgsfield.ai";

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const MODELS = [
  { key: "soul-standard",  path: "higgsfield-ai/soul/standard",                  maxDur: 60, label: "Soul Standard (60s)" },
  { key: "soul-character", path: "higgsfield-ai/soul/character",                  maxDur: 60, label: "Soul Character (60s)" },
  { key: "kling-3-t2v",    path: "kling-video/v3.0/pro/text-to-video",           maxDur: 15, label: "Kling 3.0 t2v (15s)" },
  { key: "seedance-t2v",   path: "bytedance/seedance/v1.5/pro/text-to-video",    maxDur: 12, label: "Seedance 1.5 t2v (12s)" },
];

async function callGemini(system: string, user: string): Promise<string> {
  const models = ["gemini-3-flash-preview", "gemini-flash-latest"];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0.85, maxOutputTokens: 4096 },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch { /* next */ }
  }
  throw new Error("Gemini failed");
}

async function submitHiggs(modelPath: string, prompt: string, duration: number): Promise<string> {
  const res = await fetch(`${BASE}/${modelPath}`, {
    method: "POST",
    headers: { Authorization: HIGGS_AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000), duration, aspect_ratio: "16:9", seed: 42 }),
  });
  if (!res.ok) throw new Error(`${modelPath} submit ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.request_id;
}

async function pollHiggs(requestId: string): Promise<{ status: string; videoUrl?: string }> {
  const res = await fetch(`${BASE}/requests/${requestId}/status`, {
    headers: { Authorization: HIGGS_AUTH },
  });
  if (!res.ok) throw new Error(`poll ${res.status}`);
  const data = await res.json();
  return {
    status: data.status,
    videoUrl: data.video?.url ?? data.output?.video_url ?? undefined,
  };
}

(async () => {
  // 1. Load scene data
  const scene = await p.scene.findFirst({
    where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 },
    include: {
      episode: { include: { characters: { include: { character: true } } } },
    },
  });
  if (!scene) { console.error("scene not found"); process.exit(1); }
  const mem: any = scene.memoryContext ?? {};
  const castInScene = (mem.characters as string[] ?? []);
  const allCast = scene.episode?.characters.map((c) => c.character) ?? [];
  const cast = castInScene.length > 0
    ? allCast.filter((c) => castInScene.includes(c.name))
    : allCast.slice(0, 2);

  console.log(`Scene: SC${scene.sceneNumber} "${scene.title}"`);
  console.log(`Cast: ${cast.map((c) => c.name).join(", ")}`);
  console.log(`Script: ${scene.scriptText?.length ?? 0} chars`);
  console.log(`Sound notes: ${mem.soundNotes ? "yes" : "no"}\n`);

  // 2. Use Gemini to craft a detailed 60s cinematic prompt
  console.log("Calling Gemini for detailed 60s cinematic prompt...");
  const detailedPrompt = await callGemini(
    `You are a senior cinematographer writing a detailed video-generation prompt for a 60-second scene. Write in English. Include:
1. VISUAL STYLE — film stock, camera body, lens, color grade, grain
2. OPENING (0-10s) — exact shot, camera movement, what's in frame
3. DEVELOPMENT (10-30s) — action progression, character micro-expressions, lighting shifts
4. CLIMAX (30-50s) — emotional peak, camera technique change (dolly-in, rack focus)
5. CLOSING (50-58.5s) — resolution beat, pulling back
6. FADE (58.5-60s) — smooth fade to black, audio ducks to silence
7. AUDIO throughout — score mood+tempo, foley details, ambient sounds, breathing
8. CHARACTER — describe each character's exact physical appearance (hair, skin, wardrobe, build) inline, NO reference to any external image or grid.

HARD RULES:
- Photorealistic live-action ONLY. Real actors, real skin pores.
- NEVER mention "reference image", "character sheet", or "portrait grid"
- Include specific lens mm, f-stop, color temperature in Kelvin
- Name the emotion on each character's face at each beat
- Max 1800 chars total`,
    `SCENE: "${scene.title}"
SUMMARY: ${scene.summary}
SCRIPT: ${scene.scriptText?.slice(0, 1200) ?? ""}
CAST:
${cast.map((c) => `- ${c.name} (${c.roleType}): ${c.appearance?.slice(0, 200) ?? "no description"}`).join("\n")}
SOUND NOTES: ${mem.soundNotes?.slice(0, 400) ?? "(none)"}
DURATION: 60 seconds
Write the prompt now. Max 1800 chars.`,
  );
  console.log(`✓ Prompt ready (${detailedPrompt.length} chars)\n`);
  console.log(`--- PROMPT ---\n${detailedPrompt.slice(0, 500)}...\n---\n`);

  // 3. Submit to all models
  const jobs: { key: string; label: string; requestId: string; dur: number }[] = [];
  for (const m of MODELS) {
    try {
      const rid = await submitHiggs(m.path, detailedPrompt, m.maxDur);
      jobs.push({ key: m.key, label: m.label, requestId: rid, dur: m.maxDur });
      console.log(`✓ ${m.label} → ${rid}`);
    } catch (e: any) {
      console.log(`✗ ${m.label} → ${e.message.slice(0, 200)}`);
    }
  }

  if (jobs.length === 0) { console.error("no jobs submitted"); process.exit(1); }

  // 4. Poll all until done (max 15 min)
  console.log(`\nPolling ${jobs.length} jobs...`);
  const startedAt = Date.now();
  const done = new Set<string>();
  const results: Record<string, { videoUrl?: string; status: string }> = {};

  while (done.size < jobs.length && (Date.now() - startedAt) < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 15_000));
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    for (const j of jobs) {
      if (done.has(j.key)) continue;
      try {
        const r = await pollHiggs(j.requestId);
        if (r.status === "completed") {
          done.add(j.key);
          results[j.key] = r;
          console.log(`[${elapsed}s] ✅ ${j.label} — DONE ${r.videoUrl ?? "(no url)"}`);
        } else if (r.status === "failed" || r.status === "nsfw") {
          done.add(j.key);
          results[j.key] = r;
          console.log(`[${elapsed}s] ❌ ${j.label} — ${r.status}`);
        } else {
          console.log(`[${elapsed}s] ⏳ ${j.label} — ${r.status}`);
        }
      } catch (e: any) {
        console.log(`[${elapsed}s] ⚠ ${j.label} — poll error: ${e.message.slice(0, 100)}`);
      }
    }
  }

  // 5. Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS (${done.size}/${jobs.length} completed)\n`);
  for (const j of jobs) {
    const r = results[j.key];
    if (r?.videoUrl) {
      console.log(`✅ ${j.label} (${j.dur}s)`);
      console.log(`   ${r.videoUrl}\n`);
    } else {
      console.log(`❌ ${j.label} — ${r?.status ?? "timeout"}\n`);
    }
  }

  await p.$disconnect();
})();
