import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const GEMINI_KEY = process.env.GEMINI_API_KEY!;
const AUTH = "Key e2ca9f1f-a58e-40ce-b07e-79685643ae8c:80567f1f8feaf739754d3c122ded287ac791acb9f5164514d9b0ec091480fa2a";

(async () => {
  const scene = await p.scene.findFirst({
    where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 },
    include: { episode: { include: { season: true, characters: { include: { character: true } } } } },
  });
  if (!scene) { console.error("no scene"); process.exit(1); }
  const mem: any = scene.memoryContext ?? {};
  const castNames: string[] = mem.characters ?? [];
  const allCast = scene.episode?.characters.map((c) => c.character) ?? [];
  const cast = castNames.length > 0 ? allCast.filter((c) => castNames.includes(c.name)) : allCast.slice(0, 2);
  console.log(`Cast: ${cast.map((c) => c.name).join(", ")}`);

  // Build prompt with Gemini
  const system = `You write cinema-grade video-generation prompts. Write ONE prompt in English, max 1800 chars.

MANDATORY — follow every rule:

TITLE CARD (first 2 seconds): The video OPENS with large, clean, white sans-serif text "SEASON 1 · EPISODE 1" perfectly centered on a solid black background with 15% safe margins on all sides. A warm narrator voice reads "Season 1, Episode 1" aloud in sync. After 2 seconds the text fades out smoothly and the live-action scene fades in.

CONTINUOUS MUSIC: A cinematic score plays from second 0 to the end — specify the instrument palette (e.g. solo cello + sub-bass synth), tempo (BPM), and emotional arc (building tension). The music NEVER goes silent.

FOLEY + AMBIENT: Layer realistic foley throughout — footsteps on tile, water dripping, fabric rustling, breathing, clock ticking. Specify each sound at its timecode.

PHOTOREALISTIC: Real human actors with visible skin pores, natural hair, real wardrobe fabrics. Shot on Arri Alexa 65 with specific lens (mm + f-stop). 35mm film grain, shallow depth of field. NO animation, NO CGI, NO stylized look, NO sci-fi cityscape.

CHARACTER DESCRIPTION: Describe each character's exact appearance INLINE in the prompt — hair color/length/style, skin tone, eye color, build, wardrobe. NEVER reference any external image, grid, portrait, or character sheet.

SETTING: This is a psychological thriller set in a REAL modern apartment bathroom — marble countertop, mirror, morning light through frosted glass. Grounded, intimate, everyday. NOT futuristic, NOT a megalopolis.

ENDING: Last 1.5 seconds — smooth fade to pure black, audio ducks to silence.

Timeline must cover every second with specific action + camera + audio beats.`;

  const user = `SCENE: "${scene.title}"
SUMMARY: ${scene.summary}
SCRIPT: ${scene.scriptText?.slice(0, 1000) ?? ""}
CAST:
${cast.map((c) => `- ${c.name} (${c.roleType}): ${(c.appearance ?? "").slice(0, 200)}`).join("\n")}
SOUND NOTES: ${mem.soundNotes?.slice(0, 400) ?? "(none)"}
DURATION TARGET: 15 seconds total (2s title card + 13s scene).
Write the prompt now.`;

  let prompt = "";
  for (const model of ["gemini-3-flash-preview", "gemini-flash-latest"]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const json: any = await res.json();
      prompt = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (prompt) { console.log(`✓ Gemini (${model}) → ${prompt.length} chars`); break; }
    } catch {}
  }
  if (!prompt) { console.error("Gemini failed"); process.exit(1); }
  console.log(`\n--- PROMPT ---\n${prompt.slice(0, 400)}...\n---\n`);

  // Submit
  const jobs: { label: string; path: string; dur: number; cost: number; id?: string }[] = [
    { label: "Kling 3.0", path: "kling-video/v3.0/pro/text-to-video", dur: 15, cost: 15 * 0.06 },
    { label: "Seedance 1.5", path: "bytedance/seedance/v1.5/pro/text-to-video", dur: 12, cost: 12 * 0.05 },
  ];
  for (const j of jobs) {
    try {
      const r = await fetch(`https://platform.higgsfield.ai/${j.path}`, {
        method: "POST",
        headers: { Authorization: AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.slice(0, 2000), duration: j.dur, aspect_ratio: "16:9", seed: 77 }),
      });
      const d: any = await r.json();
      j.id = d.request_id;
      console.log(`✓ ${j.label} (${j.dur}s · $${j.cost.toFixed(2)}) → ${j.id}`);
    } catch (e: any) { console.log(`✗ ${j.label}: ${e.message}`); }
  }

  // Poll
  console.log("\nPolling...");
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
          const url = d.video?.url ?? "(no url)";
          done.add(j.label);
          console.log(`[${elapsed}s] ✅ ${j.label} (${j.dur}s · $${j.cost.toFixed(2)}): ${url}`);
        } else if (d.status === "failed" || d.status === "nsfw") {
          done.add(j.label);
          console.log(`[${elapsed}s] ❌ ${j.label}: ${d.status}`);
        } else {
          console.log(`[${elapsed}s] ⏳ ${j.label}: ${d.status}`);
        }
      } catch {}
    }
  }

  // Also check Soul Standard from earlier
  console.log("\nAlso checking Soul Standard (earlier job)...");
  try {
    const r = await fetch("https://platform.higgsfield.ai/requests/53fc7661-5b3e-4fb3-91ff-3030a328069e/status", { headers: { Authorization: AUTH } });
    const d: any = await r.json();
    console.log(`Soul Standard 60s: ${d.status} ${d.video?.url ?? ""}`);
  } catch {}

  await p.$disconnect();
})();
