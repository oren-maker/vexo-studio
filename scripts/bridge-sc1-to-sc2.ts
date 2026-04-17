/**
 * Orchestrator: director consults on the SC1→SC2 bridge, rewrites SC2's
 * scriptText + directorSheet so it opens exactly at SC1's last frame,
 * then submits the video to Sora i2v using the bridge frame as seed.
 *
 * Does everything end-to-end:
 *  1. Load SC1 (approved, bridge frames) + SC2 (current state)
 *  2. Pull director knowledge (cinematography continuity refs,
 *     capability entries, recent DailyBrainCache identity)
 *  3. Call Gemini with a continuity-focused director brief + the
 *     bridge image URL; request revised scriptText + directorSheet
 *  4. Save revisions to SC2 in DB
 *  5. Build the Sora prompt locally (mirroring the server's prompt
 *     logic — continuityHeader mid-episode + HARD OVERRIDE +
 *     AUDIO 5-tracks + identityLock + endFrameRule clean-frame)
 *  6. Submit to Sora i2v with seedImageUrl
 *  7. Save pendingVideoJob on SC2 (UI will poll)
 *  8. Monitor Sora; on completion run finalize-scene-video.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
if (!KEY || !GEMINI) { console.error("OPENAI_API_KEY + GEMINI_API_KEY required"); process.exit(1); }

(async () => {
  const [sc1, sc2] = await Promise.all([
    p.scene.findFirst({ where: { episodeId: EPISODE_ID, sceneNumber: 1 } }),
    p.scene.findFirst({
      where: { episodeId: EPISODE_ID, sceneNumber: 2 },
      include: { episode: { include: { season: { include: { series: true } } } } },
    }),
  ]);
  if (!sc1 || !sc2) { console.error("scenes not found"); return; }

  const mem1: any = sc1.memoryContext ?? {};
  const mem2: any = sc2.memoryContext ?? {};
  const bridgeUrl = mem1.bridgeFrameUrl || (mem1.bridgeFrameUrls ?? [])[mem1.bridgeFrameUrls?.length - 1 ?? 0];
  if (!bridgeUrl) { console.error("SC1 has no bridgeFrameUrl — approve it first"); return; }
  console.log(`SC1 bridge: ${bridgeUrl}`);
  console.log(`SC2 seedImageUrl: ${mem2.seedImageUrl ? "✓ set" : "✗ missing"}`);

  // Ensure SC2 has the seed (propagate again if missing)
  if (!mem2.seedImageUrl) {
    await p.scene.update({
      where: { id: sc2.id },
      data: { memoryContext: { ...mem2, seedImageUrl: bridgeUrl } as any },
    });
    mem2.seedImageUrl = bridgeUrl;
    console.log("✓ propagated bridgeFrameUrl → SC2.seedImageUrl");
  }

  // ─── 1. Gather director knowledge
  const [continuityRefs, capabilities, brain] = await Promise.all([
    p.brainReference.findMany({
      where: {
        kind: "cinematography",
        OR: [
          { name: { contains: "OTS" } },
          { name: { contains: "Match" } },
          { name: { contains: "Dolly" } },
          { name: { contains: "Close-Up" } },
          { name: { contains: "Medium" } },
          { name: { contains: "180" } },
          { tags: { has: "continuity" } },
          { tags: { has: "match-cut" } },
        ],
      },
      select: { name: true, shortDesc: true, longDesc: true },
      take: 15,
    }),
    p.brainReference.findMany({
      where: { kind: "capability", tags: { hasSome: ["continuity", "bridge", "i2v"] } },
      select: { name: true, shortDesc: true },
      take: 10,
    }),
    p.dailyBrainCache.findFirst({ orderBy: { date: "desc" }, select: { identity: true } }),
  ]);

  const refsBlock = continuityRefs.map((r) => `- ${r.name}: ${r.shortDesc}\n  ${r.longDesc.slice(0, 180)}`).join("\n");
  const capsBlock = capabilities.map((c) => `- ${c.name}: ${c.shortDesc}`).join("\n");

  // ─── 2. Director brief
  const SC1_DESCR = `SC1 "${sc1.title}" · sceneNumber=1 · APPROVED\nSummary: ${sc1.summary}\nLast-frame image URL: ${bridgeUrl}\nThe bridge frame shows the FINAL second of SC1 — SC2 must open exactly at that pixel state.`;
  const SC2_CURRENT = `SC2 "${sc2.title}" · sceneNumber=2 · VIDEO_REVIEW\nCurrent summary: ${sc2.summary}\nCurrent scriptText (${sc2.scriptText?.length ?? 0} chars):\n${sc2.scriptText?.slice(0, 1000)}`;

  const directorPrompt = `You are the AI Director of "Echoes of Tomorrow". Your job: revise Scene 2 so it opens LITERALLY at the last pixel of Scene 1 — same character pose, same room, same lighting, same on-screen objects — then evolves. Use match-cut / continuity-editing principles from your knowledge base.

━━━ BRAIN IDENTITY ━━━
${brain?.identity?.slice(0, 400) ?? "(none)"}

━━━ CONTINUITY REFERENCES (from your knowledge) ━━━
${refsBlock}

━━━ RELEVANT CAPABILITIES ━━━
${capsBlock}

━━━ SCENE 1 (SEALED) ━━━
${SC1_DESCR}

━━━ SCENE 2 (TO REVISE) ━━━
${SC2_CURRENT}

━━━ YOUR TASK ━━━
Produce a revised Scene 2 that:
1. OPENS on a shot that perfectly matches the bridge frame — same character (Maya), same position, same framing, same lighting. No re-establishing shot. No cut. No relight.
2. EVOLVES naturally from that moment across 20 seconds, reflecting the summary "${sc2.summary}".
3. ENDS on a clean, stable frame — no fade-to-black (SC2 is mid-episode, not the finale). The final second must be a legible bridge to SC3.
4. Applies at least TWO concrete continuity techniques from the references above (name them in directorNotes so the prompt builder picks them up).
5. Keeps Maya's identity LOCKED (face, wardrobe, hair).

Respond with ONLY valid JSON, no prose, no markdown, no code fences:
{
  "scriptText": "string — full 20-second script in English with [TIME]-marked beats, dialogue, and action.",
  "directorSheet": {
    "style": "string",
    "scene": "string — location + lighting",
    "character": "string — Maya description, locked to SC1",
    "shots": "string — shot-by-shot with timing",
    "camera": "string — lens + movement",
    "effects": "string or 'none'",
    "audio": "string — music + SFX direction",
    "technical": "string — fps / aspect / bitrate notes"
  },
  "directorNotes": "string — 2-3 sentences naming the continuity techniques used (match cut, 180 line, eyeline, OTS, shallow DoF, etc.) so the video prompt picks them up.",
  "bridgeRationale": "string — one sentence: how SC2's opening shot physically continues from SC1's bridge frame."
}`;

  console.log("\n━━━ calling Gemini as Director ━━━");
  const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  let raw = ""; let usedModel = "";
  for (const model of MODELS) {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: directorPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 3500,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    const gdata: any = await geminiRes.json();
    if (!geminiRes.ok) {
      console.log(`  ⚠ ${model}: ${gdata?.error?.message?.slice(0, 100)}`);
      if (geminiRes.status === 503 || geminiRes.status === 429) continue;
      console.error("Gemini fatal error:", gdata); return;
    }
    raw = gdata?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    usedModel = model;
    break;
  }
  if (!raw) { console.error("all Gemini models exhausted"); return; }
  console.log(`  ✓ used model: ${usedModel}`);
  let revised: any;
  try {
    revised = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse director JSON:", raw.slice(0, 500));
    return;
  }
  console.log("✓ director returned:");
  console.log("  scriptText:", revised.scriptText?.length ?? 0, "chars");
  console.log("  directorSheet keys:", Object.keys(revised.directorSheet ?? {}).join(", "));
  console.log("  bridgeRationale:", revised.bridgeRationale);

  // ─── 3. Save revision to SC2
  await p.scene.update({
    where: { id: sc2.id },
    data: {
      scriptText: revised.scriptText,
      scriptSource: "brain-compose",
      memoryContext: {
        ...mem2,
        directorSheet: revised.directorSheet,
        directorNotes: revised.directorNotes,
        bridgeRationale: revised.bridgeRationale,
      } as any,
    },
  });
  console.log("✓ SC2 scriptText + directorSheet updated in DB");

  await (p as any).sceneLog.create({
    data: {
      sceneId: sc2.id,
      action: "director_revised_for_bridge",
      actor: "system:bridge-sc1-to-sc2",
      actorName: "AI Director (SC1→SC2 bridge)",
      details: {
        bridgeRationale: revised.bridgeRationale,
        newScriptLength: revised.scriptText?.length,
        sc1BridgeUrl: bridgeUrl,
      },
    },
  }).catch(() => {});

  // ─── 4. Build the Sora prompt (mirrors generate-video route logic)
  const sheet = revised.directorSheet;
  const castNames = (mem2.characters ?? ["Maya Ellis"]) as string[];
  const continuityHeader = `CONTINUOUS TV SERIES — MID-EPISODE CLIP. This clip is one segment of a single continuous filmic sequence (scene 2 of 1). It MUST read as an uninterrupted take from the previous clip — same characters, same room, same lighting, same on-screen objects. The reference image you see IS the final frame of the previous clip; begin exactly at that pixel state and EVOLVE from there — no re-establishing shot, no cut, no relight, no prop swap. Preserve identity + location + objects TOGETHER as one.`;

  const noReferenceGridRule = `HARD OVERRIDE (i2v safety, NON-NEGOTIABLE): the reference image(s) you received are LOOKUP ONLY — a visual reference for the character's face, wardrobe, and the location. The reference image MUST NEVER appear inside the generated video at any point. Specifically FORBIDDEN: no character reference grid / portrait sheet / character lineup, no side-by-side portraits or split-screen showing the reference, no title-cards of the character's name with their photo, no fade-in from the reference image, no "introduction card" before the action. The video begins directly with the live-action scene.`;

  const endFrameRule = `END-FRAME (mid-episode, NON-NEGOTIABLE): the final 1 second of this clip MUST settle into a cleanly composed, stable frame — no motion blur, characters holding position, lighting steady, every on-screen object clearly visible. This exact frame will be extracted and used as the opening reference for the next clip, so it must be a legible bridge between scenes. DO NOT fade to black and DO NOT end mid-motion.`;

  const continuityLock = `CONTINUITY LOCK (identity + location + objects, TOGETHER):\n · Characters: ${castNames.join(", ")} — keep every face, skin tone, hair, wardrobe EXACTLY as shown in the reference image(s). No drift.\n · Location: the room / environment is identical to the previous clip — same walls, windows, furniture layout, floor texture. Do not relocate.\n · Lighting: same color temperature, same key/fill/rim directions, same shadow angles. No relight.\n · Props & objects: every prop visible on the reference image is still present, in the same place. No disappearing items.\n · Camera continuity: keep the same lens focal length and depth of field as the reference; do NOT cross the 180° line from the previous clip.`;

  const audioBlock = `AUDIO (MANDATORY — all tracks below must be clearly audible in the final clip, correctly mixed with dialogue on top):\n1) DIALOGUE: (from scriptText) generate fully audible spoken speech in a clear adult voice; mouth shapes must match each phoneme exactly; breaths between phrases; NO silent mouth-moving.\n2) MUSIC: ${sheet.audio ?? "low-intensity underscore matching the scene's emotional tone"}. Ducked -3 to -6 dB under dialogue. ONE clear musical accent at the strongest emotional beat. 1-3 kHz gap for speech.\n3) AMBIENCE: continuous bed layer for the scene's location (room tone at -35 dB RMS interior, or exterior bed). Never truly silent.\n4) FOLEY: footsteps on the actual surface, cloth rustle, prop handling, breathing on close-ups.\n5) SCENE-SPECIFIC SOUND DESIGN: ${(mem2.soundNotes ?? "").slice(0, 700)}\nNEGATIVE: no silent dialogue frames, no music drowning speech, no abrupt audio cuts.`;

  const basePrompt = [
    continuityHeader,
    noReferenceGridRule,
    audioBlock,
    `Live-action photorealistic film. Real human actors, real skin pores, real eyes, real physical lighting. NO animation, NO CGI, NO illustration, NO 3D render.`,
    continuityLock,
    `Action this clip: ${sc2.summary}`,
    `Camera: ${sheet.camera}`,
    `Full script:\n${revised.scriptText.slice(0, 800)}`,
    `Director notes (highest priority): ${revised.directorNotes.slice(0, 400)}`,
    sheet.effects && sheet.effects.toLowerCase() !== "none" ? `Effects: ${sheet.effects}` : null,
    endFrameRule,
  ].filter(Boolean).join("\n\n");

  console.log(`\n━━━ Sora prompt preview (first 600 chars) ━━━\n${basePrompt.slice(0, 600)}\n...`);
  console.log(`\ntotal prompt length: ${basePrompt.length}`);

  // ─── 5. Resize seed image to 1280x720 and submit to Sora
  console.log("\n━━━ submitting to Sora i2v ━━━");
  const sharp = (await import("sharp")).default;
  const imgRes = await fetch(mem2.seedImageUrl);
  if (!imgRes.ok) { console.error(`seed image fetch ${imgRes.status}`); return; }
  const rawImg = Buffer.from(await imgRes.arrayBuffer());
  const resized = await sharp(rawImg).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();

  const form = new FormData();
  form.append("model", "sora-2");
  form.append("seconds", "20");
  form.append("size", "1280x720");
  form.append("prompt", basePrompt.slice(0, 2000));
  form.append("input_reference", new Blob([new Uint8Array(resized)], { type: "image/jpeg" }), "seed.jpg");

  const sora = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
  });
  const sdata: any = await sora.json();
  if (!sora.ok) { console.error("Sora submit failed:", sdata); return; }
  console.log(`✓ Sora submitted: ${sdata.id} · ${sdata.status}`);

  await p.scene.update({
    where: { id: sc2.id },
    data: {
      status: "VIDEO_GENERATING",
      memoryContext: {
        ...mem2,
        directorSheet: revised.directorSheet,
        directorNotes: revised.directorNotes,
        bridgeRationale: revised.bridgeRationale,
        pendingVideoJob: {
          provider: "openai",
          jobId: sdata.id,
          model: "sora-2",
          durationSeconds: 20,
          submittedAt: new Date().toISOString(),
          kind: "bridge-generate",
          sourceAssetId: null,
        },
      } as any,
    },
  });
  console.log(`✓ pendingVideoJob saved on SC2\n\nJOB_ID=${sdata.id}`);

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
