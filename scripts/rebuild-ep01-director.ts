/**
 * EP01 REBUILD — DIRECTOR-LED
 *
 * Step 1: Ask the AI Director (with full brain context) to PLAN the episode
 *         as one continuous sequence split into 10 clips of 20s each.
 * Step 2: For each clip, the Director writes the exact scriptText ensuring
 *         clip N ends exactly where clip N+1 begins.
 * Step 3: Insert scenes + run Director Sheet + Sound Notes + Critic.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
const CLIP_COUNT = 10;
const CLIP_DURATION = 20;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error("GEMINI_API_KEY missing"); process.exit(1); }
const BASE_URL = "https://vexo-studio.vercel.app";

async function callGemini(system: string, user: string, maxTokens = 16384): Promise<string> {
  for (const model of ["gemini-3-flash-preview", "gemini-flash-latest"]) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { temperature: 0.85, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(90_000),
        },
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      const reply = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (reply) return reply;
    } catch { /* next */ }
  }
  throw new Error("all Gemini models failed");
}

(async () => {
  console.log("═══════════════════════════════════════");
  console.log("  EP01 DIRECTOR-LED REBUILD");
  console.log("═══════════════════════════════════════\n");

  // ─── LOAD ALL CONTEXT ───
  const ep: any = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: {
      season: { include: { series: { select: { title: true, summary: true, genre: true } } } },
      scenes: { orderBy: { sceneNumber: "asc" } },
      characters: { include: { character: { select: { name: true, roleType: true, appearance: true, personality: true, wardrobeRules: true } } } },
    },
  });
  const refs = await p.brainReference.findMany({
    where: { kind: { in: ["emotion", "sound", "cinematography", "capability"] } },
    orderBy: [{ kind: "asc" }, { order: "asc" }],
    select: { kind: true, name: true, shortDesc: true, longDesc: true },
  });
  const byKind: Record<string, string[]> = {};
  for (const r of refs) (byKind[r.kind] ??= []).push(`${r.name}: ${r.shortDesc ?? ""} ${(r.longDesc ?? "").slice(0, 100)}`);
  const daily: any = await p.dailyBrainCache.findFirst({ orderBy: { date: "desc" } });
  const guides = await p.guide.findMany({
    orderBy: { viewCount: "desc" }, take: 20,
    select: { slug: true, translations: { select: { title: true, summary: true }, take: 1 } },
  });
  const analysis: any = await p.insightsSnapshot.findFirst({
    where: { kind: "series_analysis" }, orderBy: { takenAt: "desc" }, select: { summary: true },
  });

  console.log(`Series: ${ep.season.series.title}`);
  console.log(`Episode: "${ep.title}" — ${ep.synopsis?.slice(0, 100)}`);
  console.log(`Cast: ${ep.characters.map((c: any) => c.character.name).join(", ")}`);
  console.log(`Brain refs: ${Object.entries(byKind).map(([k, v]) => `${k}:${v.length}`).join(" · ")}\n`);

  // ─── STEP 1: DIRECTOR PLANS THE EPISODE ───
  console.log("🎬 Step 1: Director plans the episode as one continuous sequence...\n");

  const directorSystem = `You are the AI Director of "${ep.season.series.title}". You have deep knowledge of cinematography, sound design, emotional storytelling, and this specific series.

YOUR TASK: Plan episode "${ep.title}" as ONE CONTINUOUS VISUAL SEQUENCE that will be split into ${CLIP_COUNT} clips of ${CLIP_DURATION} seconds each (${CLIP_COUNT * CLIP_DURATION} seconds total).

CRITICAL UNDERSTANDING — CLIPS, NOT EPISODES:
These ${CLIP_COUNT} "scenes" are NOT separate episodes or vignettes. They are CLIPS — short segments of ONE continuous shot that will be MERGED into a single video. The viewer must NOT notice any cut between clips.

RULES:
- Clip N's LAST FRAME must be EXACTLY clip N+1's FIRST FRAME: same camera position, same character pose, same lighting, same location.
- NO location jumps between consecutive clips. If a location change happens, it must happen WITHIN a clip (character walks from room A to room B during the clip).
- Every second must have visible progression — no static "staring" for 20 seconds.
- The camera is always moving: dolly, pan, track, push-in, pull-back. Name the exact movement.
- Maya Ellis is the ONLY protagonist. Use EXACTLY her appearance: olive skin, freckles, dark brown wavy hair in messy bun, charcoal silk robe.

EPISODE FLOW REQUIREMENTS:
- Clip 1: Aerial descent to suburban house → "SEASON 1 · EPISODE 1" text for 3 seconds → camera enters house → reaches Maya at bathroom mirror
- Clips 2-9: The story unfolds continuously — Maya discovers her reflection is wrong, investigates, encounters other characters — all in a PHYSICALLY CONNECTED sequence
- Clip 10: Resolution + 1.5 second fade to black

OUTPUT FORMAT (strict JSON):
{"clips":[
  {"number":1,"title":"short title","location":"where this clip takes place","summary_he":"one Hebrew sentence","transition_from":"none (first clip)","transition_to":"Maya turns toward the door — clip ends mid-turn","scriptText":"full 300-500 word English Sora prompt with 8 sections"},
  ...
]}

Each clip's scriptText must include: Visual Style, Lens & Camera, Lighting, Color Palette, Character, Environment, Audio, Timeline (second-by-second for ${CLIP_DURATION}s).`;

  const directorUser = `EPISODE SYNOPSIS: ${ep.synopsis}

CHARACTERS:
${ep.characters.map((c: any) => `- ${c.character.name} (${c.character.roleType}): ${c.character.appearance?.slice(0, 200) ?? ""} | Personality: ${c.character.personality?.slice(0, 100) ?? ""} | Wardrobe: ${c.character.wardrobeRules?.slice(0, 100) ?? ""}`).join("\n")}

DIRECTOR'S NOTES (from the producer — MUST follow):
- Clip 1 starts with aerial shot descending to a house in a quiet suburb, enters inside, reaches Maya at bathroom mirror
- Every clip ends where the next begins — zero visual discontinuity
- "SEASON 1 · EPISODE 1" appears as white text overlay in the first 3 seconds of clip 1
- Last clip fades to black with 1.5 seconds

MY CINEMATOGRAPHY KNOWLEDGE:
${(byKind.cinematography ?? []).slice(0, 20).join("\n")}

MY SOUND DESIGN KNOWLEDGE:
${(byKind.sound ?? []).slice(0, 20).join("\n")}

MY EMOTIONAL PALETTE:
${(byKind.emotion ?? []).slice(0, 15).join("\n")}

MY CAPABILITIES:
${(byKind.capability ?? []).slice(0, 15).join("\n")}

MY IDENTITY TODAY: ${daily?.identity?.slice(0, 300) ?? "(none)"}
SERIES ANALYSIS: ${analysis?.summary?.slice(0, 400) ?? "(none)"}
GUIDES I'VE STUDIED: ${guides.map((g: any) => g.translations?.[0]?.title ?? g.slug).slice(0, 15).join(" · ")}

Plan the ${CLIP_COUNT} clips now. Return JSON only.`;

  const raw = await callGemini(directorSystem, directorUser);
  let txt = raw.trim();
  const first = txt.indexOf("{"); const last = txt.lastIndexOf("}");
  if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
  const plan = JSON.parse(txt) as { clips: Array<{ number: number; title: string; location: string; summary_he: string; transition_from: string; transition_to: string; scriptText: string }> };
  if (plan.clips.length !== CLIP_COUNT) throw new Error(`Expected ${CLIP_COUNT} clips, got ${plan.clips.length}`);

  console.log("✓ Director planned the episode:\n");
  for (const c of plan.clips) {
    console.log(`  ${c.number}. "${c.title}" [${c.location}]`);
    console.log(`     ${c.summary_he}`);
    console.log(`     → ${c.transition_to}\n`);
  }

  // ─── STEP 2: DELETE OLD + INSERT NEW ───
  console.log("🗑  Step 2: Replacing scenes...");
  fs.mkdirSync("./scripts/snapshots", { recursive: true });
  fs.writeFileSync(`./scripts/snapshots/ep01-director-${Date.now()}.json`, JSON.stringify(ep.scenes, null, 2));
  const oldIds = ep.scenes.map((s: any) => s.id);
  if (oldIds.length > 0) {
    await p.sceneFrame.deleteMany({ where: { sceneId: { in: oldIds } } });
    await (p as any).sceneLog?.deleteMany({ where: { sceneId: { in: oldIds } } }).catch(() => {});
    await p.asset.deleteMany({ where: { entityType: "SCENE", entityId: { in: oldIds } } });
    await p.aICriticReview.deleteMany({ where: { sceneId: { in: oldIds } } }).catch(() => {});
  }
  await p.scene.deleteMany({ where: { episodeId: EPISODE_ID } });

  const castList = ep.characters.map((c: any) => c.character.name);
  const newSceneIds: string[] = [];
  for (const c of plan.clips) {
    const text = [c.title, c.summary_he, c.scriptText].join(" ").toLowerCase();
    const present = castList.filter((name: string) => {
      const parts = name.toLowerCase().split(/\s+/);
      return text.includes(name.toLowerCase()) || (parts[0].length >= 3 && text.includes(parts[0]));
    });
    const scene = await p.scene.create({
      data: {
        parentType: "episode", parentId: EPISODE_ID, episodeId: EPISODE_ID,
        sceneNumber: c.number, title: c.title, summary: c.summary_he, scriptText: c.scriptText,
        scriptSource: "director-led-rebuild",
        targetDurationSeconds: CLIP_DURATION,
        status: "STORYBOARD_APPROVED",
        memoryContext: {
          characters: present.length > 0 ? present : ["Maya Ellis"],
          location: c.location,
          transitionTo: c.transition_to,
        } as any,
      },
    });
    newSceneIds.push(scene.id);
  }
  await p.episode.update({ where: { id: EPISODE_ID }, data: { targetDurationSeconds: CLIP_COUNT * CLIP_DURATION } });
  console.log(`   ✓ ${newSceneIds.length} clips inserted\n`);

  // ─── STEP 3: RUN AI ON EACH ───
  console.log("🤖 Step 3: Running AI on each clip...");
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@vexo.studio", password: "Vexo@2025!" }),
  });
  const token = (await loginRes.json() as any).accessToken ?? "";

  for (let i = 0; i < newSceneIds.length; i++) {
    const sid = newSceneIds[i];
    const c = plan.clips[i];
    process.stdout.write(`   ${c.number}. "${c.title}" `);
    // Director Sheet
    try { await fetch(`${BASE_URL}/api/v1/scenes/${sid}/director-sheet`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }); process.stdout.write("📋"); } catch { process.stdout.write("⚠"); }
    // Sound Notes
    try { await fetch(`${BASE_URL}/api/v1/scenes/${sid}/sound-notes`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }); process.stdout.write("🔊"); } catch { process.stdout.write("⚠"); }
    // Critic
    try {
      const r = await (await fetch(`${BASE_URL}/api/v1/scenes/${sid}/critic/review`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" })).json() as any;
      const score = r?.score ?? r?.data?.score;
      process.stdout.write(`🧐${score ? ` ${(score * 100).toFixed(0)}%` : ""}`);
    } catch { process.stdout.write("⚠"); }
    console.log();
  }

  console.log("\n✅ EP01 director-led rebuild complete.");
  console.log(`   ${newSceneIds.length} clips × ${CLIP_DURATION}s = ${CLIP_COUNT * CLIP_DURATION}s`);
  await p.$disconnect();
})();
