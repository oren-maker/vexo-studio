/**
 * End-to-end scene advancement:
 *   1. Approve scene N — mark status=APPROVED, extract 4 bridge frames
 *      from primary video, propagate t-1s to scene N+1 as seedImageUrl.
 *   2. Consult the director, revise scene N+1's scriptText + sheet so
 *      it opens at N's bridge frame.
 *   3. Submit scene N+1 to Sora i2v using the bridge as seed.
 *   4. Return the pending job id; caller monitors + runs finalize.
 *
 * Usage:
 *   npx tsx scripts/approve-and-advance.ts <episodeId> <sourceSceneNumber>
 *
 * Example: to take scene 2 → scene 3:
 *   npx tsx scripts/approve-and-advance.ts cmny2i5k2000lu7yrxy2s63r6 2
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
const EPISODE_ID = process.argv[2];
const SOURCE_N = Number(process.argv[3]);
if (!EPISODE_ID || isNaN(SOURCE_N)) { console.error("usage: approve-and-advance.ts <episodeId> <sceneNumber>"); process.exit(1); }
if (!KEY || !GEMINI || !process.env.BLOB_READ_WRITE_TOKEN) { console.error("OPENAI + GEMINI + BLOB tokens required"); process.exit(1); }

(async () => {
  const source = await p.scene.findFirst({
    where: { episodeId: EPISODE_ID, sceneNumber: SOURCE_N },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  const target = await p.scene.findFirst({
    where: { episodeId: EPISODE_ID, sceneNumber: SOURCE_N + 1 },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  if (!source) { console.error(`SC${SOURCE_N} not found`); return; }
  if (!target) { console.error(`SC${SOURCE_N + 1} not found`); return; }
  console.log(`━━━ SOURCE: SC${SOURCE_N} "${source.title}" · status=${source.status}`);
  console.log(`━━━ TARGET: SC${SOURCE_N + 1} "${target.title}" · status=${target.status}`);

  const mem1: any = source.memoryContext ?? {};

  // STEP 1 — approve SC_N: extract bridge frames if not already, flip status, propagate seed
  let bridgeUrls: string[] = mem1.bridgeFrameUrls ?? [];
  if (bridgeUrls.length < 4) {
    console.log(`\n━━━ STEP 1: extracting 4 bridge frames from SC${SOURCE_N} ━━━`);

    const primary = await p.asset.findFirst({
      where: { entityType: "SCENE", entityId: source.id, assetType: "VIDEO", status: "READY" },
      orderBy: { createdAt: "desc" },
      select: { fileUrl: true, metadata: true },
    });
    if (!primary) { console.error("no READY video on SC" + SOURCE_N); return; }
    const pmeta: any = primary.metadata ?? {};
    const soraId = pmeta.soraVideoId ?? primary.fileUrl.match(/[?&]id=(video_[^&]+)/)?.[1];
    if (!soraId) { console.error("no soraVideoId"); return; }

    const res = await fetch(`https://api.openai.com/v1/videos/${soraId}/content`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) { console.error(`OpenAI fetch ${res.status}`); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`  downloaded ${Math.round(buf.length / 1024)}KB`);

    const fs = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");
    const { execSync } = await import("child_process");
    const ts = Date.now();
    const tmp = path.join(os.tmpdir(), `aa-${ts}.mp4`);
    await fs.writeFile(tmp, buf);

    const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string };
    const ffmpegBin = ffmpegInstaller.path;
    try { await fs.chmod(ffmpegBin, 0o755); } catch { /* ignore */ }

    const windows = [{ start: 4, label: "t-4s" }, { start: 3, label: "t-3s" }, { start: 2, label: "t-2s" }, { start: 1, label: "t-1s" }];
    const framePaths: string[] = [];
    for (const w of windows) {
      const out = path.join(os.tmpdir(), `aa-${ts}-${w.label}.jpg`);
      try {
        execSync(`"${ffmpegBin}" -sseof -${w.start} -skip_frame nokey -i "${tmp}" -vf "thumbnail=30,unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${out}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
        await fs.access(out);
      } catch {
        execSync(`"${ffmpegBin}" -sseof -${w.start} -i "${tmp}" -vf "unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${out}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
        await fs.access(out);
      }
      framePaths.push(out);
      console.log(`  ✓ ${w.label}`);
    }

    const sharp = (await import("sharp")).default;
    const { put } = await import("@vercel/blob");
    const urls: string[] = [];
    for (let i = 0; i < framePaths.length; i++) {
      const raw = await fs.readFile(framePaths[i]);
      const resized = await sharp(raw).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
      const blob = await put(`bridge-frames/scene-${ts}-${i + 1}.jpg`, resized, { access: "public", contentType: "image/jpeg" });
      urls.push(blob.url);
    }
    await fs.unlink(tmp).catch(() => {});
    for (const fp of framePaths) await fs.unlink(fp).catch(() => {});
    bridgeUrls = urls;
    console.log(`  ✓ uploaded ${urls.length} frames`);
  } else {
    console.log(`\n━━━ STEP 1: SC${SOURCE_N} already has ${bridgeUrls.length} bridge frames — skipping extraction`);
  }

  const bridgeUrl = bridgeUrls[bridgeUrls.length - 1];

  // Approve SC_N + save bridge frames
  await p.scene.update({
    where: { id: source.id },
    data: {
      status: "APPROVED",
      memoryContext: { ...mem1, bridgeFrameUrl: bridgeUrl, bridgeFrameUrls: bridgeUrls } as any,
    },
  });
  console.log(`  ✓ SC${SOURCE_N} status=APPROVED, ${bridgeUrls.length} bridge frames saved`);

  // Propagate to target
  const mem2: any = target.memoryContext ?? {};
  await p.scene.update({
    where: { id: target.id },
    data: { memoryContext: { ...mem2, seedImageUrl: bridgeUrl } as any },
  });
  mem2.seedImageUrl = bridgeUrl;
  console.log(`  ✓ SC${SOURCE_N + 1}.seedImageUrl propagated`);

  await (p as any).sceneLog.create({ data: { sceneId: source.id, action: "scene_approved", actor: "system:approve-and-advance", actorName: "Approve-and-advance script", details: { bridgeFrameUrls: bridgeUrls } } }).catch(() => {});

  // STEP 2 — director consults, revises SC_{N+1}
  console.log(`\n━━━ STEP 2: director consult — revise SC${SOURCE_N + 1} to open at SC${SOURCE_N}'s bridge ━━━`);
  const [refs, caps, brain] = await Promise.all([
    p.brainReference.findMany({
      where: { kind: "cinematography", OR: [{ name: { contains: "OTS" } }, { name: { contains: "Match" } }, { name: { contains: "Dolly" } }, { name: { contains: "Close-Up" } }, { name: { contains: "Medium" } }, { tags: { has: "continuity" } }, { tags: { has: "match-cut" } }] },
      select: { name: true, shortDesc: true, longDesc: true }, take: 15,
    }),
    p.brainReference.findMany({
      where: { kind: "capability", tags: { hasSome: ["continuity", "bridge", "i2v"] } },
      select: { name: true, shortDesc: true }, take: 10,
    }),
    p.dailyBrainCache.findFirst({ orderBy: { date: "desc" }, select: { identity: true } }),
  ]);
  const refsBlock = refs.map((r) => `- ${r.name}: ${r.shortDesc}\n  ${r.longDesc.slice(0, 180)}`).join("\n");
  const capsBlock = caps.map((c) => `- ${c.name}: ${c.shortDesc}`).join("\n");

  const directorPrompt = `You are the AI Director of "Echoes of Tomorrow". Scene ${SOURCE_N + 1} must open LITERALLY at Scene ${SOURCE_N}'s last pixel — same character pose, same room, same lighting, same on-screen objects — then evolve across 20 seconds. Use match-cut / continuity-editing principles.

BRAIN IDENTITY:
${brain?.identity?.slice(0, 400) ?? "(none)"}

CONTINUITY REFERENCES:
${refsBlock}

CAPABILITIES:
${capsBlock}

SCENE ${SOURCE_N} (SEALED):
Title: "${source.title}"
Summary: ${source.summary}
Last-frame image: ${bridgeUrl}

SCENE ${SOURCE_N + 1} (TO REVISE):
Title: "${target.title}"
Summary: ${target.summary}
Current script (${target.scriptText?.length ?? 0} chars):
${target.scriptText?.slice(0, 1000)}

Produce revised Scene ${SOURCE_N + 1} that: (1) opens perfectly matching the bridge frame — no re-establishing shot, no cut, no relight; (2) evolves naturally across 20s matching the summary; (3) ends on a CLEAN stable frame (no fade-to-black, mid-episode); (4) applies ≥2 named continuity techniques; (5) locks Maya's identity.

Respond with ONLY valid JSON:
{
  "scriptText": "full 20s English script with [TIME] beats, dialogue, action",
  "directorSheet": { "style": "...", "scene": "...", "character": "...", "shots": "...", "camera": "...", "effects": "...", "audio": "...", "technical": "..." },
  "directorNotes": "2-3 sentences naming the continuity techniques used",
  "bridgeRationale": "one sentence on how SC${SOURCE_N + 1} opens physically from SC${SOURCE_N}'s bridge"
}`;

  const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  let raw = ""; let usedModel = "";
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: directorPrompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 3500 } }),
      signal: AbortSignal.timeout(60_000),
    });
    const d: any = await r.json();
    if (!r.ok) { console.log(`  ⚠ ${model}: ${d?.error?.message?.slice(0, 100)}`); if (r.status === 503 || r.status === 429) continue; return; }
    raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    usedModel = model;
    break;
  }
  if (!raw) { console.error("all Gemini models exhausted"); return; }
  const revised: any = JSON.parse(raw);
  console.log(`  ✓ ${usedModel} · scriptLen=${revised.scriptText?.length} · rationale="${revised.bridgeRationale}"`);

  await p.scene.update({
    where: { id: target.id },
    data: {
      scriptText: revised.scriptText,
      scriptSource: "brain-compose",
      memoryContext: { ...mem2, directorSheet: revised.directorSheet, directorNotes: revised.directorNotes, bridgeRationale: revised.bridgeRationale } as any,
    },
  });
  await (p as any).sceneLog.create({ data: { sceneId: target.id, action: "director_revised_for_bridge", actor: "system:approve-and-advance", actorName: "Director (bridge)", details: { bridgeRationale: revised.bridgeRationale, sourceBridge: bridgeUrl } } }).catch(() => {});
  console.log(`  ✓ SC${SOURCE_N + 1} scriptText + directorSheet saved`);

  // STEP 3 — build Sora prompt and submit
  console.log(`\n━━━ STEP 3: submit SC${SOURCE_N + 1} to Sora i2v ━━━`);
  const sheet = revised.directorSheet;
  const castNames = (mem2.characters ?? ["Maya Ellis"]) as string[];
  const prompt = [
    `CONTINUOUS TV SERIES — MID-EPISODE CLIP (scene ${SOURCE_N + 1} of ${target.episode?.episodeNumber ?? "?"}). The reference image is the final frame of the previous clip; begin exactly at that pixel state and EVOLVE — no re-establishing shot, no cut, no relight, no prop swap. Preserve identity + location + objects TOGETHER.`,
    `HARD OVERRIDE (i2v safety, NON-NEGOTIABLE): the reference image is LOOKUP ONLY — for identity + wardrobe + location. The reference image MUST NEVER appear inside the generated video. FORBIDDEN: character reference grid, portrait sheet, lineup, split-screen, title card with photo, fade-in from reference, introduction card. Begin directly with the live-action scene.`,
    `AUDIO (MANDATORY — clearly audible):\n1) DIALOGUE: (from scriptText) audible speech, phoneme-level lip-sync, breaths, NO silent mouth-moving.\n2) MUSIC: ${sheet.audio ?? "low-intensity underscore"}. Ducked -3 to -6 dB under dialogue, 1-3 kHz gap, ONE emotional sting.\n3) AMBIENCE: continuous bed (room tone -35dB or exterior). Never silent.\n4) FOLEY: footsteps on named surface, cloth rustle, prop handling, breathing.\n5) SFX: ${(mem2.soundNotes ?? "").slice(0, 500)}`,
    `Live-action photorealistic film. Real actors, real skin pores, real eyes. NO animation, NO CGI, NO illustration.`,
    `CONTINUITY LOCK: Characters ${castNames.join(", ")} — identical face/skin/hair/wardrobe to reference. Location — identical walls, windows, furniture, floor. Lighting — same color temp, same key/fill/rim, same shadow angles. Props — every visible item preserved. Camera — same lens and DoF; do NOT cross the 180° line.`,
    `Action this clip: ${target.summary}`,
    `Camera: ${sheet.camera}`,
    `Full script:\n${revised.scriptText.slice(0, 800)}`,
    `Director notes: ${revised.directorNotes.slice(0, 400)}`,
    sheet.effects && sheet.effects.toLowerCase() !== "none" ? `Effects: ${sheet.effects}` : null,
    `END-FRAME (mid-episode, NON-NEGOTIABLE): final 1s settles into a cleanly composed, stable frame — no motion blur, characters holding position, lighting steady, every on-screen object visible. This seeds the next clip. DO NOT fade to black. DO NOT end mid-motion.`,
  ].filter(Boolean).join("\n\n");

  // Resize seed to 1280x720
  const sharp2 = (await import("sharp")).default;
  const imgRes = await fetch(bridgeUrl);
  const rawImg = Buffer.from(await imgRes.arrayBuffer());
  const resizedSeed = await sharp2(rawImg).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();

  const form = new FormData();
  form.append("model", "sora-2");
  form.append("seconds", "20");
  form.append("size", "1280x720");
  form.append("prompt", prompt.slice(0, 2000));
  form.append("input_reference", new Blob([new Uint8Array(resizedSeed)], { type: "image/jpeg" }), "seed.jpg");

  const sora = await fetch("https://api.openai.com/v1/videos", { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form });
  const sdata: any = await sora.json();
  if (!sora.ok) { console.error("Sora submit failed:", sdata); return; }
  console.log(`  ✓ Sora submitted: ${sdata.id} · ${sdata.status}`);

  await p.scene.update({
    where: { id: target.id },
    data: {
      status: "VIDEO_GENERATING",
      memoryContext: {
        ...mem2,
        directorSheet: revised.directorSheet,
        directorNotes: revised.directorNotes,
        bridgeRationale: revised.bridgeRationale,
        pendingVideoJob: { provider: "openai", jobId: sdata.id, model: "sora-2", durationSeconds: 20, submittedAt: new Date().toISOString(), kind: "bridge-generate" },
      } as any,
    },
  });
  console.log(`  ✓ pendingVideoJob saved on SC${SOURCE_N + 1}\n\nJOB_ID=${sdata.id}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
