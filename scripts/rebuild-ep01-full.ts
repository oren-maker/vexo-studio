/**
 * FULL EP01 REBUILD
 * 1. Generate 10 connected scenes via Gemini (with full brain context)
 * 2. Delete old scenes, insert new (STORYBOARD_APPROVED)
 * 3. For each scene: Director Sheet + Sound Notes + AI Critic
 * 4. Print summary report
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
const SCENE_COUNT = 10;
const SCENE_DURATION = 20;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error("GEMINI_API_KEY missing"); process.exit(1); }

const BASE_URL = "https://vexo-studio.vercel.app";

async function callGemini(system: string, user: string): Promise<string> {
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
            generationConfig: { temperature: 0.9, maxOutputTokens: 16384, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(60_000),
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

async function loginAndGetToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@vexo.studio", password: "Vexo@2025!" }),
  });
  const d: any = await res.json();
  return d.accessToken ?? d.token ?? "";
}

async function callSceneAPI(token: string, sceneId: string, path: string, method = "POST"): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/v1/scenes/${sceneId}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
  return res.json();
}

(async () => {
  console.log("═══════════════════════════════════════");
  console.log("  EP01 FULL REBUILD");
  console.log("═══════════════════════════════════════\n");

  // ─── LOAD CONTEXT ───
  const ep: any = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: {
      season: { include: { series: { select: { title: true, summary: true, genre: true } } } },
      scenes: { orderBy: { sceneNumber: "asc" } },
      characters: { include: { character: { select: { name: true, roleType: true, appearance: true, personality: true } } } },
    },
  });
  if (!ep) { console.error("episode not found"); process.exit(1); }
  console.log(`Episode: "${ep.title}" — ${ep.season.series.title}`);
  console.log(`Current scenes: ${ep.scenes.length}`);
  console.log(`Cast: ${ep.characters.map((c: any) => c.character.name).join(", ")}\n`);

  // Brain context (load once)
  const refs = await p.brainReference.findMany({
    where: { kind: { in: ["emotion", "sound", "cinematography", "capability"] } },
    orderBy: [{ kind: "asc" }, { order: "asc" }],
    select: { kind: true, name: true, shortDesc: true },
  });
  const byKind: Record<string, string[]> = {};
  for (const r of refs) (byKind[r.kind] ??= []).push(`${r.name}${r.shortDesc ? ` — ${r.shortDesc.slice(0, 80)}` : ""}`);
  const daily: any = await p.dailyBrainCache.findFirst({ orderBy: { date: "desc" } });
  const guides = await p.guide.findMany({
    orderBy: { viewCount: "desc" }, take: 20,
    select: { slug: true, translations: { select: { title: true }, take: 1 } },
  });
  const nodes = await p.knowledgeNode.findMany({
    orderBy: { confidence: "desc" }, take: 30,
    select: { type: true, title: true },
  });
  const analysis: any = await p.insightsSnapshot.findFirst({
    where: { kind: "series_analysis" }, orderBy: { takenAt: "desc" }, select: { summary: true },
  });

  // ─── STEP 1: GENERATE 10 SCENES ───
  console.log("📝 Step 1: Generating 10 connected scenes via Gemini...");

  const system = `You are a senior TV showrunner writing 10 connected scenes for a Hebrew-Israeli psychological thriller episode. Each scene = exactly ${SCENE_DURATION} seconds.

OUTPUT: strict JSON, no fences:
{"scenes":[{"number":1,"title":"<2-5 words EN>","summary":"<one Hebrew sentence>","scriptText":"<full English Sora 2 prompt, 300-500 words>","characters":["Maya Ellis"]},...]}

scriptText has 8 MANDATORY sections (inline, not markdown):
1. Visual Style 2. Lens & Camera 3. Lighting 4. Color Palette 5. Character 6. Environment 7. Audio (foley + score + voice) 8. Timeline (0-5s/5-12s/12-18s/18-20s)

HARD RULES:
- PHOTOREALISTIC live-action only. Real actors, 35mm film, shallow DoF. NO animation.
- CHARACTER NAMES: Use ONLY "Maya Ellis" as protagonist. NEVER "Mira Chen".
- Maya Ellis: 33, olive skin, subtle freckles, sharp jawline, dark brown wavy hair in messy bun, charcoal oversized silk robe (at home) / navy blazer (at work).
- SCENE 1 MUST: Start with aerial descent to suburban house at dawn + "SEASON 1 · EPISODE 1" text overlay for 3 seconds + narrator reads it. Then enter the house → hallway → bathroom → Maya at mirror.
- SCENE 10 MUST: End with 1.5s fade-to-black + audio ducks to silence.
- CONTINUITY: Each scene's last 2 seconds MUST hook into the next scene's opening. Describe the carry-over explicitly.
- AUDIO: Every scene has continuous cinematic score (specify instrument+BPM+mood) + foley throughout. Never silent.
- Every scriptText ends with: "ENDING: last 1.5 seconds fade to black, audio ducks."`;

  const user = `SERIES: ${ep.season.series.title}
GENRE: ${ep.season.series.genre ?? "Psychological thriller"}
SYNOPSIS: ${ep.synopsis}

CHARACTERS:
${ep.characters.map((c: any) => `- ${c.character.name} (${c.character.roleType}): ${(c.character.appearance ?? "").slice(0, 150)}`).join("\n")}

DIRECTOR NOTES (from Oren — MUST follow):
- Scene 1: Aerial view descending to a house in a quiet suburb, camera enters inside with effects until reaching Maya
- Every scene ends with a short fade-out for continuity between scenes
- "SEASON 1 · EPISODE 1" appears as text overlay in the first 3 seconds

BRAIN — emotions: ${(byKind.emotion ?? []).slice(0, 15).join(" · ")}
BRAIN — sounds: ${(byKind.sound ?? []).slice(0, 15).join(" · ")}
BRAIN — cinematography: ${(byKind.cinematography ?? []).slice(0, 15).join(" · ")}
BRAIN — capabilities: ${(byKind.capability ?? []).slice(0, 15).join(" · ")}
BRAIN IDENTITY: ${daily?.identity?.slice(0, 400) ?? "(none)"}
GUIDES: ${guides.map((g: any) => g.translations?.[0]?.title ?? g.slug).slice(0, 15).join(" · ")}
NODES: ${nodes.map((n: any) => `[${n.type}] ${n.title}`).slice(0, 20).join(" · ")}
SERIES ANALYSIS: ${analysis?.summary?.slice(0, 400) ?? "(none)"}

Write ${SCENE_COUNT} scenes. Return JSON only.`;

  const raw = await callGemini(system, user);
  let txt = raw.trim();
  const first = txt.indexOf("{"); const last = txt.lastIndexOf("}");
  if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
  const parsed = JSON.parse(txt) as { scenes: Array<{ number: number; title: string; summary: string; scriptText: string; characters: string[] }> };
  if (parsed.scenes.length !== SCENE_COUNT) throw new Error(`Expected ${SCENE_COUNT} scenes, got ${parsed.scenes.length}`);
  console.log(`✓ ${parsed.scenes.length} scenes generated\n`);

  // ─── STEP 2: DELETE OLD + INSERT NEW ───
  console.log("🗑  Step 2: Replacing old scenes...");
  fs.mkdirSync("./scripts/snapshots", { recursive: true });
  fs.writeFileSync(`./scripts/snapshots/ep01-rebuild-${Date.now()}.json`, JSON.stringify(ep.scenes, null, 2));
  console.log(`   Snapshot saved`);

  const oldIds = ep.scenes.map((s: any) => s.id);
  if (oldIds.length > 0) {
    await p.sceneFrame.deleteMany({ where: { sceneId: { in: oldIds } } });
    await (p as any).sceneLog?.deleteMany({ where: { sceneId: { in: oldIds } } }).catch(() => {});
    await p.asset.deleteMany({ where: { entityType: "SCENE", entityId: { in: oldIds } } });
    await p.aICriticReview.deleteMany({ where: { sceneId: { in: oldIds } } }).catch(() => {});
  }
  await p.scene.deleteMany({ where: { episodeId: EPISODE_ID } });
  console.log(`   Deleted ${oldIds.length} old scenes`);

  const castList = ep.characters.map((c: any) => c.character.name);
  const newSceneIds: string[] = [];
  for (const s of parsed.scenes) {
    const text = [s.title, s.summary, s.scriptText].filter(Boolean).join(" ").toLowerCase();
    const present = (s.characters ?? castList).filter((name: string) => {
      const parts = name.toLowerCase().split(/\s+/);
      if (text.includes(name.toLowerCase())) return true;
      if (parts.length >= 2 && parts[0].length >= 3 && text.includes(parts[0])) return true;
      return false;
    });
    const scene = await p.scene.create({
      data: {
        parentType: "episode", parentId: EPISODE_ID, episodeId: EPISODE_ID,
        sceneNumber: s.number, title: s.title, summary: s.summary, scriptText: s.scriptText,
        scriptSource: "rebuild-ep01-full",
        targetDurationSeconds: SCENE_DURATION,
        status: "STORYBOARD_APPROVED",
        memoryContext: { characters: present.length > 0 ? present : ["Maya Ellis"] } as any,
      },
    });
    newSceneIds.push(scene.id);
  }
  await p.episode.update({ where: { id: EPISODE_ID }, data: { targetDurationSeconds: SCENE_COUNT * SCENE_DURATION } });
  console.log(`   Created ${newSceneIds.length} new scenes\n`);

  // ─── STEP 3: RUN AI ON EACH SCENE ───
  console.log("🤖 Step 3: Running AI (Director Sheet + Sound Notes + Critic) on each scene...");
  const token = await loginAndGetToken();
  if (!token) { console.error("Login failed"); process.exit(1); }
  console.log(`   Logged in\n`);

  const results: Array<{ num: number; title: string; chars: string[]; critic?: number; feedback?: string }> = [];

  for (let i = 0; i < newSceneIds.length; i++) {
    const sid = newSceneIds[i];
    const s = parsed.scenes[i];
    process.stdout.write(`   SC${String(s.number).padStart(2, "0")} "${s.title}" `);

    // Director Sheet
    try {
      await callSceneAPI(token, sid, "director-sheet");
      process.stdout.write("📋");
    } catch { process.stdout.write("⚠"); }

    // Sound Notes
    try {
      await callSceneAPI(token, sid, "sound-notes");
      process.stdout.write("🔊");
    } catch { process.stdout.write("⚠"); }

    // AI Critic
    let score: number | undefined;
    let feedback: string | undefined;
    try {
      const r = await callSceneAPI(token, sid, "critic/review");
      score = r?.score ?? r?.data?.score;
      feedback = r?.feedback ?? r?.data?.feedback;
      process.stdout.write(`🧐${score ? ` ${(score * 100).toFixed(0)}%` : ""}`);
    } catch { process.stdout.write("⚠"); }

    results.push({ num: s.number, title: s.title, chars: s.characters ?? ["Maya Ellis"], critic: score, feedback });
    console.log();
  }

  // ─── STEP 4: REPORT ───
  console.log("\n═══════════════════════════════════════");
  console.log("  REPORT");
  console.log("═══════════════════════════════════════\n");

  for (const r of results) {
    const scoreStr = r.critic ? `${(r.critic * 100).toFixed(0)}%` : "—";
    console.log(`SC${String(r.num).padStart(2, "0")} "${r.title}" · ${r.chars.join(", ")} · Critic: ${scoreStr}`);
    if (r.feedback) console.log(`     ${r.feedback.slice(0, 120)}`);
  }

  const avgScore = results.filter((r) => r.critic).reduce((s, r) => s + (r.critic ?? 0), 0) / (results.filter((r) => r.critic).length || 1);
  console.log(`\nAverage critic score: ${(avgScore * 100).toFixed(0)}%`);
  console.log(`Total scenes: ${results.length}`);
  console.log(`Total duration: ${results.length * SCENE_DURATION}s`);
  console.log(`Estimated cost: ~$0.12 (Gemini text calls)`);
  console.log(`\n✅ EP01 rebuild complete.`);

  await p.$disconnect();
})();
