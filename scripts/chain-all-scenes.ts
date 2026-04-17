/**
 * Autonomous multi-scene bridge chain:
 *   Starts at scene N (assumed to have a READY video), approves it,
 *   revises N+1, generates N+1, waits for completion, finalizes, then
 *   advances. Repeats until scene endN.
 *
 * Usage:
 *   npx tsx scripts/chain-all-scenes.ts <episodeId> <startN> <endN>
 *
 * Example: chain SC3 → SC10:
 *   npx tsx scripts/chain-all-scenes.ts cmny2i5k2000lu7yrxy2s63r6 3 10
 *
 * Writes status line on every state change so a Monitor can tail it
 * and surface events to the user.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
const EPISODE_ID = process.argv[2];
const START_N = Number(process.argv[3]);
const END_N = Number(process.argv[4]);
if (!EPISODE_ID || isNaN(START_N) || isNaN(END_N)) {
  console.error("usage: chain-all-scenes.ts <episodeId> <startN> <endN>");
  process.exit(1);
}
if (!KEY || !GEMINI || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("OPENAI + GEMINI + BLOB tokens required");
  process.exit(1);
}

function log(msg: string) {
  const now = new Date().toISOString().slice(11, 19);
  console.log(`[${now}] ${msg}`);
}

async function extractBridgeFrames(sceneId: string, sourceVideoId: string): Promise<string[]> {
  const res = await fetch(`https://api.openai.com/v1/videos/${sourceVideoId}/content`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`OpenAI video fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const fs = await import("fs/promises");
  const path = await import("path");
  const os = await import("os");
  const { execSync } = await import("child_process");
  const ts = Date.now();
  const tmp = path.join(os.tmpdir(), `ca-${ts}.mp4`);
  await fs.writeFile(tmp, buf);

  const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string };
  const ffmpegBin = ffmpegInstaller.path;
  try { await fs.chmod(ffmpegBin, 0o755); } catch {}

  const windows = [
    { start: 4, label: "t-4s" },
    { start: 3, label: "t-3s" },
    { start: 2, label: "t-2s" },
    { start: 1, label: "t-1s" },
  ];
  const framePaths: string[] = [];
  for (const w of windows) {
    const out = path.join(os.tmpdir(), `ca-${ts}-${w.label}.jpg`);
    try {
      execSync(`"${ffmpegBin}" -sseof -${w.start} -skip_frame nokey -i "${tmp}" -vf "thumbnail=30,unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${out}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
      await fs.access(out);
    } catch {
      execSync(`"${ffmpegBin}" -sseof -${w.start} -i "${tmp}" -vf "unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${out}" -y`, { stdio: ["ignore", "ignore", "pipe"] });
      await fs.access(out);
    }
    framePaths.push(out);
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
  return urls;
}

async function directorRevise(sourceN: number, targetN: number, source: any, target: any, bridgeUrl: string): Promise<any> {
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

  const prompt = `You are the AI Director. Scene ${targetN} must open LITERALLY at scene ${sourceN}'s last pixel — same pose, room, lighting, objects — then evolve across 20s.

BRAIN IDENTITY:\n${brain?.identity?.slice(0, 400) ?? "(none)"}

CONTINUITY REFS:\n${refsBlock}

CAPABILITIES:\n${capsBlock}

SC${sourceN} (sealed):
Title: "${source.title}"
Summary: ${source.summary}
Bridge frame: ${bridgeUrl}

SC${targetN} (to revise):
Title: "${target.title}"
Summary: ${target.summary}
Current script (${target.scriptText?.length ?? 0} chars):
${target.scriptText?.slice(0, 1000)}

Produce revised SC${targetN}: opens matching the bridge, evolves across 20s per summary, ends clean (no fade), applies ≥2 named continuity techniques, locks Maya's identity.

Respond with ONLY valid JSON: {"scriptText":"...","directorSheet":{"style":"...","scene":"...","character":"...","shots":"...","camera":"...","effects":"...","audio":"...","technical":"..."},"directorNotes":"...","bridgeRationale":"..."}`;

  const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 3500 } }),
      signal: AbortSignal.timeout(60_000),
    });
    const d: any = await r.json();
    if (!r.ok) { if (r.status === 503 || r.status === 429) { log(`  Gemini ${model} busy, trying next`); continue; } throw new Error(`Gemini ${model}: ${d?.error?.message}`); }
    const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { ...JSON.parse(raw), usedModel: model };
  }
  throw new Error("all Gemini models exhausted");
}

async function submitSceneVideo(target: any, revised: any, seedUrl: string): Promise<string> {
  const sheet = revised.directorSheet;
  const castNames = (target.memoryContext?.characters ?? ["Maya Ellis"]) as string[];
  const prompt = [
    `CONTINUOUS TV SERIES — MID-EPISODE CLIP. The reference image is the final frame of the previous clip; begin exactly at that pixel state and EVOLVE — no re-establishing shot, no cut, no relight, no prop swap. Preserve identity + location + objects TOGETHER.`,
    `HARD OVERRIDE (i2v safety, NON-NEGOTIABLE): the reference image is LOOKUP ONLY. It MUST NEVER appear on screen. No character reference grid, no portrait sheet, no lineup, no split-screen, no title card with photo, no fade-in from reference, no introduction card.`,
    `AUDIO (MANDATORY):\n1) DIALOGUE: (from scriptText) audible speech, phoneme-level lip-sync, breaths, no silent mouth-moving.\n2) MUSIC: ${sheet.audio ?? "low-intensity underscore"}. Ducked -3/-6 dB under dialogue, 1-3 kHz gap, one emotional sting.\n3) AMBIENCE: continuous bed. Never silent.\n4) FOLEY: footsteps, cloth, prop handling, breathing.\n5) SFX: ${(target.memoryContext?.soundNotes ?? "").slice(0, 400)}`,
    `Live-action photorealistic film. Real actors, real skin, real lighting. NO animation/CGI/illustration.`,
    `CONTINUITY LOCK: ${castNames.join(", ")} — identical face/skin/hair/wardrobe. Same location, lighting, props, 180° line.`,
    `Action this clip: ${target.summary}`,
    `Camera: ${sheet.camera}`,
    `Script:\n${revised.scriptText.slice(0, 800)}`,
    `Director notes: ${revised.directorNotes.slice(0, 400)}`,
    sheet.effects && sheet.effects.toLowerCase() !== "none" ? `Effects: ${sheet.effects}` : null,
    `END-FRAME (mid-episode): final 1s settles into a cleanly composed, stable frame — no motion blur, characters holding position, lighting steady. Seeds the next clip. DO NOT fade to black.`,
  ].filter(Boolean).join("\n\n");

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
  if (!sora.ok) throw new Error(`Sora: ${JSON.stringify(sdata).slice(0, 200)}`);
  return sdata.id;
}

async function waitForSora(jobId: string): Promise<"completed" | "failed"> {
  const start = Date.now();
  while (Date.now() - start < 20 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    try {
      const r = await fetch(`https://api.openai.com/v1/videos/${jobId}`, { headers: { Authorization: `Bearer ${KEY}` } });
      const d: any = await r.json();
      const status = d.status;
      const prog = d.progress ?? 0;
      log(`  [${jobId.slice(-12)}] ${status} ${prog}%`);
      if (status === "completed") return "completed";
      if (status === "failed" || status === "cancelled") return "failed";
    } catch (e: any) {
      log(`  poll error: ${e.message?.slice(0, 100)}`);
    }
  }
  return "failed";
}

async function finalize(sceneId: string, jobId: string, kind: string): Promise<void> {
  const s = await p.scene.findUnique({
    where: { id: sceneId },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  const projectId = s?.episode?.season?.series?.projectId;
  if (!projectId) throw new Error("no projectId");
  const proxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(jobId)}`;
  await p.asset.create({
    data: {
      projectId, entityType: "SCENE", entityId: sceneId, assetType: "VIDEO",
      fileUrl: proxyUrl, mimeType: "video/mp4", status: "READY",
      metadata: { provider: "openai", model: "sora-2", durationSeconds: 20, soraVideoId: jobId, costUsd: 2, kind } as any,
    },
  });
  const mem: any = s?.memoryContext ?? {};
  const { pendingVideoJob: _, lastVideoError: __, ...rest } = mem;
  await p.scene.update({ where: { id: sceneId }, data: { status: "VIDEO_REVIEW", memoryContext: rest as any } });
}

(async () => {
  log(`━━━ CHAIN START: ep=${EPISODE_ID} SC${START_N} → SC${END_N} ━━━`);

  for (let n = START_N; n < END_N; n++) {
    log(`\n━━━ ITERATION: SC${n} → SC${n + 1} ━━━`);

    const source = await p.scene.findFirst({
      where: { episodeId: EPISODE_ID, sceneNumber: n },
      include: { episode: { include: { season: { include: { series: true } } } } },
    });
    const target = await p.scene.findFirst({
      where: { episodeId: EPISODE_ID, sceneNumber: n + 1 },
      include: { episode: { include: { season: { include: { series: true } } } } },
    });
    if (!source || !target) { log(`  ⚠ scene missing (SC${n} or SC${n + 1}), stopping`); break; }

    // 1. Approve source + extract bridge frames (if not already)
    let mem1: any = source.memoryContext ?? {};
    let bridgeUrls: string[] = mem1.bridgeFrameUrls ?? [];
    if (bridgeUrls.length < 4) {
      const primary = await p.asset.findFirst({
        where: { entityType: "SCENE", entityId: source.id, assetType: "VIDEO", status: "READY" },
        orderBy: { createdAt: "desc" }, select: { fileUrl: true, metadata: true },
      });
      if (!primary) { log(`  ⚠ SC${n} no READY video; stopping chain`); break; }
      const pmeta: any = primary.metadata ?? {};
      const soraId = pmeta.soraVideoId ?? primary.fileUrl.match(/[?&]id=(video_[^&]+)/)?.[1];
      if (!soraId) { log(`  ⚠ SC${n} no soraVideoId; stopping`); break; }
      log(`  extracting 4 bridge frames from SC${n} (sora=${soraId.slice(-12)})`);
      bridgeUrls = await extractBridgeFrames(source.id, soraId);
      log(`  ✓ ${bridgeUrls.length} frames uploaded`);
    } else {
      log(`  SC${n} already has ${bridgeUrls.length} bridge frames`);
    }
    const bridgeUrl = bridgeUrls[bridgeUrls.length - 1];
    await p.scene.update({
      where: { id: source.id },
      data: { status: "APPROVED", memoryContext: { ...mem1, bridgeFrameUrl: bridgeUrl, bridgeFrameUrls: bridgeUrls } as any },
    });
    log(`  ✓ SC${n} APPROVED`);

    // 2. Propagate seed to target
    const mem2: any = target.memoryContext ?? {};
    await p.scene.update({
      where: { id: target.id },
      data: { memoryContext: { ...mem2, seedImageUrl: bridgeUrl } as any },
    });
    log(`  ✓ SC${n + 1}.seedImageUrl propagated`);

    // 3. Director consults + revises target
    log(`  director consulting…`);
    const revised = await directorRevise(n, n + 1, source, target, bridgeUrl);
    log(`  ✓ ${revised.usedModel} revised (script=${revised.scriptText?.length} chars)`);
    log(`    rationale: ${revised.bridgeRationale}`);
    await p.scene.update({
      where: { id: target.id },
      data: {
        scriptText: revised.scriptText,
        scriptSource: "brain-compose",
        memoryContext: { ...mem2, seedImageUrl: bridgeUrl, directorSheet: revised.directorSheet, directorNotes: revised.directorNotes, bridgeRationale: revised.bridgeRationale } as any,
      },
    });
    await (p as any).sceneLog.create({ data: { sceneId: target.id, action: "director_revised_for_bridge", actor: "system:chain-all", actorName: "Director (chain)", details: { bridgeRationale: revised.bridgeRationale, sourceBridge: bridgeUrl } } }).catch(() => {});

    // 4. Submit target to Sora i2v
    log(`  submitting SC${n + 1} to Sora…`);
    const targetFull = await p.scene.findUnique({ where: { id: target.id } });
    const jobId = await submitSceneVideo(targetFull!, revised, bridgeUrl);
    log(`  ✓ job: ${jobId.slice(-12)}`);
    await p.scene.update({
      where: { id: target.id },
      data: {
        status: "VIDEO_GENERATING",
        memoryContext: {
          ...(await p.scene.findUnique({ where: { id: target.id } }))?.memoryContext as any,
          pendingVideoJob: { provider: "openai", jobId, model: "sora-2", durationSeconds: 20, submittedAt: new Date().toISOString(), kind: "chain-advance" },
        } as any,
      },
    });

    // 5. Wait for completion
    const result = await waitForSora(jobId);
    if (result !== "completed") { log(`  ❌ SC${n + 1} job ${result}; stopping`); break; }

    // 6. Finalize
    await finalize(target.id, jobId, "chain-advance");
    log(`  ✅ SC${n + 1} READY`);
  }

  log(`\n━━━ CHAIN COMPLETE ━━━`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
