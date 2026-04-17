/**
 * SC9 keeps getting blocked by Sora moderation even with keyword sanitization.
 * Root cause: the scene's full atmosphere (simulation reveal, "cold hard
 * determination", "shock", dark basement, multiverse identity crisis) reads
 * to Sora's moderation as psychological thriller. Keyword-level sanitize
 * isn't enough.
 *
 * Fix: ask the Director to REWRITE the whole scene with a softer emotional
 * register — curiosity instead of dread, wonder instead of shock, warm
 * discovery instead of cold determination — while keeping the same
 * narrative beat (Maya sees screens showing her lives, understands she's
 * in a simulation). Then submit + continue SC10.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
if (!KEY || !GEMINI) { console.error("OPENAI + GEMINI required"); process.exit(1); }

function log(m: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

async function rewriteSoftly(scene: any, bridgeUrl: string): Promise<any> {
  const prompt = `You are the AI Director of "Echoes of Tomorrow". Sora's content-moderation system keeps blocking Scene 9 because the current script (simulation reveal, cold determination, dark basement, shock, "soldier" imagery) reads as psychological thriller.

REWRITE Scene 9 with a SOFTER emotional register while KEEPING the same narrative beat. Rules:
- Replace dread/shock/threat with CURIOSITY, wonder, quiet discovery.
- Replace "cold, hard determination" with "calm understanding".
- Replace "soldier/military/combat" imagery entirely — the screens can show Maya as artist, teacher, dancer, writer (NOT military/police/authority figures).
- Drop "dark basement" framing — the room can be a quiet study, a well-lit gallery, or a luminous hall.
- Drop "shock" — Maya's reaction is gentle realization, not terror.
- Keep: (a) opening matches the bridge frame (Maya, same pose, same lighting), (b) a wall/array of screens/mirrors showing variations of her life, (c) the understanding that she's inside a simulation.

SC9 (TO REWRITE):
Current title: "${scene.title}"
Summary: ${scene.summary}
Bridge frame: ${bridgeUrl}

Respond with ONLY valid JSON:
{"scriptText":"new 20s script with [TIME] beats","directorSheet":{"style":"...","scene":"...","character":"...","shots":"...","camera":"...","effects":"...","audio":"...","technical":"..."},"directorNotes":"named continuity techniques","bridgeRationale":"how SC9 opens from SC8's bridge"}

CRITICAL: avoid these trigger categories — military/police/combat/weapon/violence/death/crime/surveillance/thriller/paranoid/dark-psychological/dread/terror/shock/determination-in-a-threat-context. The scene should feel like gentle awakening, not horror-reveal.`;

  const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.8, maxOutputTokens: 3500 } }),
      signal: AbortSignal.timeout(60_000),
    });
    const d: any = await r.json();
    if (!r.ok) { if (r.status === 503 || r.status === 429) continue; throw new Error(`Gemini: ${d?.error?.message}`); }
    const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Extract first JSON object robustly — Gemini sometimes adds trailing content
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    const jsonStr = firstBrace >= 0 && lastBrace > firstBrace ? raw.slice(firstBrace, lastBrace + 1) : raw;
    try {
      return JSON.parse(jsonStr);
    } catch (e: any) {
      console.error(`  JSON parse err on ${model}: ${e.message?.slice(0, 100)}`);
      console.error(`  raw preview: ${raw.slice(0, 300)}`);
      continue;
    }
  }
  throw new Error("all models busy");
}

async function submitAndWait(sceneId: string, summary: string, directorSheet: any, scriptText: string, directorNotes: string, seedUrl: string, cast: string[]): Promise<string | null> {
  const sheet = directorSheet;
  const prompt = [
    `CONTINUOUS TV SERIES — MID-EPISODE CLIP. Reference image is the final frame of the previous clip; begin exactly there and EVOLVE. No re-establishing, no cut, no relight.`,
    `HARD OVERRIDE: reference image is LOOKUP ONLY. Never appears on screen.`,
    `AUDIO: DIALOGUE — clear speech with lip-sync. MUSIC — ${sheet.audio ?? "gentle ambient"}. AMBIENCE — continuous bed. FOLEY — footsteps, cloth, breathing.`,
    `Live-action photorealistic film. Real actors, real skin, real lighting.`,
    `CONTINUITY LOCK: ${cast.join(", ")} — identical face/skin/hair/wardrobe. Same location, lighting, props, 180° line.`,
    `Action this clip: ${summary}`,
    `Camera: ${sheet.camera}`,
    `Script:\n${scriptText.slice(0, 800)}`,
    `Director notes: ${directorNotes.slice(0, 400)}`,
    `END-FRAME (mid-episode): clean stable frame. DO NOT fade to black.`,
  ].join("\n\n");

  const sharp = (await import("sharp")).default;
  const imgRes = await fetch(seedUrl);
  const rawImg = Buffer.from(await imgRes.arrayBuffer());
  const resized = await sharp(rawImg).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();

  const form = new FormData();
  form.append("model", "sora-2");
  form.append("seconds", "20");
  form.append("size", "1280x720");
  form.append("prompt", prompt.slice(0, 2000));
  form.append("input_reference", new Blob([new Uint8Array(resized)], { type: "image/jpeg" }), "seed.jpg");

  const sora = await fetch("https://api.openai.com/v1/videos", { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form });
  const sdata: any = await sora.json();
  if (!sora.ok) { log(`  Sora submit ERR: ${JSON.stringify(sdata).slice(0, 200)}`); return null; }
  const jobId = sdata.id;
  log(`  submitted ${jobId.slice(-12)}`);

  const start = Date.now();
  while (Date.now() - start < 20 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const r = await fetch(`https://api.openai.com/v1/videos/${jobId}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d: any = await r.json();
    log(`  [${jobId.slice(-12)}] ${d.status} ${d.progress ?? 0}%`);
    if (d.status === "completed") {
      const s = await p.scene.findUnique({ where: { id: sceneId }, include: { episode: { include: { season: { include: { series: true } } } } } });
      const projectId = s?.episode?.season?.series?.projectId;
      if (!projectId) return null;
      await p.asset.create({
        data: { projectId, entityType: "SCENE", entityId: sceneId, assetType: "VIDEO", fileUrl: `/api/v1/videos/sora-proxy?id=${encodeURIComponent(jobId)}`, mimeType: "video/mp4", status: "READY", metadata: { provider: "openai", model: "sora-2", durationSeconds: 20, soraVideoId: jobId, costUsd: 2, kind: "soft-rewrite" } as any },
      });
      const m: any = s?.memoryContext ?? {};
      const { pendingVideoJob: _, lastVideoError: __, ...rest } = m;
      await p.scene.update({ where: { id: sceneId }, data: { status: "VIDEO_REVIEW", memoryContext: rest as any } });
      return jobId;
    }
    if (d.status === "failed" || d.status === "cancelled") {
      log(`  ❌ ${d.error?.code}: ${d.error?.message}`);
      return null;
    }
  }
  return null;
}

(async () => {
  log("━━━ SC9 soft rewrite + retry ━━━");
  const sc9 = await p.scene.findFirst({ where: { episodeId: EPISODE_ID, sceneNumber: 9 } });
  if (!sc9) { log("SC9 not found"); return; }
  const mem9: any = sc9.memoryContext ?? {};
  if (!mem9.seedImageUrl) { log("SC9 no seedImageUrl"); return; }

  // Step 1: rewrite softly
  const revised = await rewriteSoftly(sc9, mem9.seedImageUrl);
  log(`  ✓ director rewrote SC9 (script=${revised.scriptText?.length} chars)`);
  log(`  rationale: ${revised.bridgeRationale}`);

  await p.scene.update({
    where: { id: sc9.id },
    data: {
      scriptText: revised.scriptText,
      scriptSource: "brain-soft-rewrite",
      memoryContext: { ...mem9, directorSheet: revised.directorSheet, directorNotes: revised.directorNotes, bridgeRationale: revised.bridgeRationale } as any,
    },
  });
  log("  ✓ SC9 saved to DB");

  // Step 2: submit + wait
  const cast = (mem9.characters ?? ["Maya Ellis"]) as string[];
  const job9 = await submitAndWait(sc9.id, revised.directorSheet?.scene ?? sc9.summary ?? "", revised.directorSheet, revised.scriptText, revised.directorNotes, mem9.seedImageUrl, cast);
  if (!job9) { log("❌ SC9 still blocked after soft rewrite; manual intervention needed"); return; }
  log("  ✅ SC9 READY");

  // Step 3: advance to SC10
  log("\n━━━ advancing SC9 → SC10 ━━━");
  const { execSync } = await import("child_process");
  try {
    execSync(`npx tsx scripts/approve-and-advance.ts ${EPISODE_ID} 9`, { stdio: "inherit" });
  } catch (e: any) {
    log(`approve-and-advance ERR: ${e.message?.slice(0, 200)}`);
    return;
  }

  // Step 4: wait for SC10
  const sc10 = await p.scene.findFirst({ where: { episodeId: EPISODE_ID, sceneNumber: 10 } });
  if (!sc10) { log("SC10 not found"); return; }
  const mem10: any = sc10.memoryContext ?? {};
  const pj = mem10.pendingVideoJob;
  if (!pj?.jobId) { log("SC10 no pending job"); return; }
  log(`  monitoring SC10 ${pj.jobId.slice(-12)}`);

  const start = Date.now();
  while (Date.now() - start < 20 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const r = await fetch(`https://api.openai.com/v1/videos/${pj.jobId}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d: any = await r.json();
    log(`  [${pj.jobId.slice(-12)}] ${d.status} ${d.progress ?? 0}%`);
    if (d.status === "completed") {
      const s = await p.scene.findUnique({ where: { id: sc10.id }, include: { episode: { include: { season: { include: { series: true } } } } } });
      const projectId = s?.episode?.season?.series?.projectId;
      if (!projectId) break;
      await p.asset.create({
        data: { projectId, entityType: "SCENE", entityId: sc10.id, assetType: "VIDEO", fileUrl: `/api/v1/videos/sora-proxy?id=${encodeURIComponent(pj.jobId)}`, mimeType: "video/mp4", status: "READY", metadata: { provider: "openai", model: "sora-2", durationSeconds: 20, soraVideoId: pj.jobId, costUsd: 2, kind: "chain-advance" } as any },
      });
      const m: any = s?.memoryContext ?? {};
      const { pendingVideoJob: _, lastVideoError: __, ...rest } = m;
      await p.scene.update({ where: { id: sc10.id }, data: { status: "VIDEO_REVIEW", memoryContext: rest as any } });
      log("  ✅ SC10 READY");
      break;
    }
    if (d.status === "failed" || d.status === "cancelled") { log(`  ❌ ${d.error?.code}`); break; }
  }

  log("\n━━━ DONE ━━━");
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
