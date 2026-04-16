/**
 * One-shot: rewrite EP01 of "Echoes of Tomorrow" as 10 × 20s scenes.
 *
 * Pulls:
 *   - Episode synopsis + characters
 *   - BrainReference (emotion / sound / cinematography)
 *   - Latest series_analysis InsightsSnapshot
 *
 * Calls Gemini 3 Flash Preview once with a locked JSON schema; receives 10
 * scene objects (title, summary, scriptText); snapshots existing scenes to
 * PromptVersion, deletes them, inserts the 10 new rows.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6"; // Echoes of Tomorrow · S1 · EP01
const SCENE_COUNT = 10;
const SCENE_DURATION_SEC = 20;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error("GEMINI_API_KEY missing"); process.exit(1); }

async function callGemini(system: string, user: string): Promise<string> {
  const models = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"];
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 16384, responseMimeType: "application/json" },
        }),
      });
      if (!res.ok) { console.log(`${model} ${res.status}: ${(await res.text()).slice(0, 200)}`); continue; }
      const json: any = await res.json();
      const reply = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (reply) { console.log(`✓ ${model} → ${reply.length} chars`); return reply; }
    } catch (e: any) { console.log(`${model} threw: ${e.message}`); }
  }
  throw new Error("all models failed");
}

(async () => {
  // 1. Episode context
  const ep: any = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: {
      season: { include: { series: { select: { title: true, summary: true, genre: true } } } },
      scenes: { orderBy: { sceneNumber: "asc" } },
      characters: { include: { character: { select: { name: true, roleType: true, appearance: true, personality: true } } } },
    },
  });
  if (!ep) { console.error("episode not found"); process.exit(1); }
  console.log(`\nEP01: "${ep.title}" — ${ep.season.series.title} · S${ep.season.seasonNumber}`);
  console.log(`Synopsis: ${ep.synopsis}`);
  console.log(`Existing scenes: ${ep.scenes.length}`);
  console.log(`Cast: ${ep.characters.map((c: any) => c.character.name).join(", ")}`);

  // 2. Brain references
  const refs = await p.brainReference.findMany({
    where: { kind: { in: ["emotion", "sound", "cinematography", "capability"] } },
    orderBy: [{ kind: "asc" }, { order: "asc" }],
    select: { kind: true, name: true, shortDesc: true },
  });
  const byKind = refs.reduce((acc: Record<string, string[]>, r) => {
    (acc[r.kind] ??= []).push(`${r.name}${r.shortDesc ? ` — ${r.shortDesc.slice(0, 80)}` : ""}`);
    return acc;
  }, {});

  // 3. Latest series analysis + current brain identity
  const analysis: any = await p.insightsSnapshot.findFirst({
    where: { kind: "series_analysis" },
    orderBy: { takenAt: "desc" },
    select: { summary: true },
  });
  const daily: any = await p.dailyBrainCache.findFirst({ orderBy: { date: "desc" } });
  // Recent Guide titles — the brain's accumulated craft library
  const guides = await p.guide.findMany({
    orderBy: { viewCount: "desc" },
    take: 20,
    select: { slug: true, category: true, translations: { select: { title: true, summary: true }, take: 1 } },
  });
  // Top KnowledgeNodes by confidence (fields: type, title, body, confidence)
  const nodes = await p.knowledgeNode.findMany({
    orderBy: { confidence: "desc" },
    take: 30,
    select: { type: true, title: true, body: true },
  });

  // 4. Build prompt
  const system = `You are a senior TV showrunner + cinematographer writing the complete shot-list for a single episode of an AI-directed Hebrew-Israeli psychological thriller series.

OUTPUT CONTRACT (strict JSON, no prose, no markdown fences):
{
  "scenes": [
    { "number": 1, "title": "<2-5 words>", "summary": "<one Hebrew sentence — what happens>",
      "scriptText": "<full English video-generation prompt for Sora 2, 300-500 words — see STRUCTURE>" },
    ... exactly ${SCENE_COUNT} entries ...
  ]
}

scriptText STRUCTURE (each of the 8 sections is mandatory, use the exact headers inline — NOT as markdown):
1. Visual Style — genre + shot medium + reference films/directors
2. Lens & Camera — focal length, movement (dolly/crane/handheld/static), height, speed
3. Lighting — time of day, source, color temperature, practicals
4. Color Palette — dominant hues + accents, emotional code
5. Character — who's in frame, wardrobe, emotion, micro-action
6. Environment — exact location, textures, weather, set dressing, atmosphere
7. Audio — diegetic (foley list), score (instrument + tempo + mood), spatial treatment
8. Timeline — beat-by-beat for ${SCENE_DURATION_SEC} seconds: 0-5s, 5-12s, 12-18s, 18-20s

DURATION HARD CONSTRAINT: every scene is exactly ${SCENE_DURATION_SEC} seconds. The timeline in scriptText must fit ${SCENE_DURATION_SEC}s.

STYLE HARD CONSTRAINT: photorealistic live-action (35mm film grain, shallow DoF), NOT animation, NOT illustration.

CONTINUITY — HARD REQUIREMENT (the user explicitly asked for this):
- The ${SCENE_COUNT} scenes form ONE connected story arc, not vignettes.
- Each scene's closing beat (18-20s) must CAUSE/MOTIVATE the next scene's opening beat (0-5s). Write the "hook" into the timeline so Sora knows to end mid-gesture, mid-glance, mid-reveal.
- Same cast continues between scenes unless the script explicitly introduces a new character. Wardrobe stays identical within a day; change only when the on-screen time jumps.
- Location transitions must be explained in dialogue or visible in the previous scene (ex: phone rings at end of scene 3 → scene 4 opens in the car driving to the source of the call).
- Reference the series BIBLE (title + synopsis + existing beat structure below) — scenes follow the full ARC: setup → inciting incident → escalation → midpoint reversal → crisis → resolution.

EPISODE-END FADE-OUT — HARD RULE:
The LAST scene (#${SCENE_COUNT}) must end with a **1.5-second fade-to-black** (18.5-20s), so the episode closes cleanly and the NEXT episode can fade-in from black. The fade MUST be explicit in the Timeline section: "18.5-20s: slow fade to black, audio ducks to silence." Also include "final frame fades to pure black — continuity bridge to EP02" in the Visual Style note.
For scenes 1-9 (NOT the last), do NOT fade. Hard-cut from final beat to bridge into the next scene's opening.`;

  const user = `SERIES: ${ep.season.series.title}
GENRE: ${ep.season.series.genre ?? "Psychological thriller"}
SERIES SUMMARY: ${ep.season.series.summary ?? "(none)"}

EPISODE ${ep.episodeNumber}: "${ep.title}"
EPISODE SYNOPSIS: ${ep.synopsis}
TARGET DURATION: ${SCENE_COUNT * SCENE_DURATION_SEC} seconds total (${SCENE_COUNT} scenes × ${SCENE_DURATION_SEC}s)

EXISTING BEAT STRUCTURE (for reference — rewrite in 10 scenes, don't copy):
${ep.scenes.map((s: any) => `  Scene ${s.sceneNumber}: ${s.title} — ${s.summary?.slice(0, 140) ?? ""}`).join("\n")}

CHARACTERS AVAILABLE:
${ep.characters.map((c: any) => `  - ${c.character.name} (${c.character.roleType}): ${(c.character.appearance ?? "").slice(0, 120)}`).join("\n")}

BRAIN KNOWLEDGE — emotions you can invoke:
${(byKind.emotion ?? []).slice(0, 15).join("\n")}

BRAIN KNOWLEDGE — sound techniques:
${(byKind.sound ?? []).slice(0, 15).join("\n")}

BRAIN KNOWLEDGE — cinematography:
${(byKind.cinematography ?? []).slice(0, 15).join("\n")}

BRAIN KNOWLEDGE — director's self-documented capabilities (apply these actively):
${(byKind.capability ?? []).slice(0, 20).join("\n")}

BRAIN IDENTITY (current, from the daily brain cache):
${daily?.identity?.slice(0, 500) ?? "(none)"}
TODAY'S LEARNINGS:
${daily?.todayLearnings?.slice(0, 400) ?? "(none)"}
TOMORROW'S FOCUS:
${daily?.tomorrowFocus?.slice(0, 300) ?? "(none)"}

BRAIN CRAFT LIBRARY (top 20 guides — techniques to draw from):
${guides.map((g: any) => `  · [${g.category ?? "—"}] ${g.translations?.[0]?.title ?? g.slug}${g.translations?.[0]?.summary ? ` — ${g.translations[0].summary.slice(0, 80)}` : ""}`).join("\n")}

BRAIN LEARNED FACTS (top 30 knowledge nodes):
${nodes.map((n: any) => `  · [${n.type}] ${n.title}${n.body ? ` — ${String(n.body).slice(0, 80)}` : ""}`).join("\n")}

RECENT SERIES ANALYSIS:
${analysis?.summary?.slice(0, 600) ?? "(none)"}

Write ${SCENE_COUNT} scenes that dramatize "${ep.title}" beat-by-beat, each exactly ${SCENE_DURATION_SEC} seconds. Return JSON only.`;

  console.log(`\nPrompt built. system=${system.length}ch · user=${user.length}ch. Calling Gemini…`);
  const raw = await callGemini(system, user);

  // 5. Parse — strip fences + isolate the outermost object
  let parsed: { scenes: Array<{ number: number; title: string; summary: string; scriptText: string }> };
  try {
    let txt = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    // Isolate the outermost {...} in case of extra trailing chars
    const first = txt.indexOf("{");
    const last = txt.lastIndexOf("}");
    if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
    parsed = JSON.parse(txt);
  } catch (e: any) {
    console.error(`JSON parse failed: ${e.message}\nRaw tail (last 300): ${raw.slice(-300)}`);
    process.exit(1);
  }
  if (!parsed?.scenes || parsed.scenes.length !== SCENE_COUNT) {
    console.error(`Expected ${SCENE_COUNT} scenes, got ${parsed?.scenes?.length}. Aborting.`);
    process.exit(1);
  }
  console.log(`✓ Received ${parsed.scenes.length} scenes.`);

  // 6. Snapshot old scripts to disk before deleting (PromptVersion is
  // LearnSource-scoped so we write a simple JSON file instead).
  const fs = await import("fs");
  const snapshotPath = `./scripts/snapshots/ep01-scenes-pre-${Date.now()}.json`;
  fs.mkdirSync("./scripts/snapshots", { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(ep.scenes, null, 2));
  console.log(`✓ Snapshotted ${ep.scenes.length} old scripts to ${snapshotPath}`);

  // 7. Delete existing scenes — clear FK dependents first (frames, logs, etc.)
  const oldSceneIds = ep.scenes.map((s: any) => s.id);
  if (oldSceneIds.length > 0) {
    await p.sceneFrame.deleteMany({ where: { sceneId: { in: oldSceneIds } } });
    // SceneLog / SceneFeedback models may not exist in this schema — just
    // try each. Any missing table is a no-op.
    await (p as any).sceneLog?.deleteMany({ where: { sceneId: { in: oldSceneIds } } }).catch(() => {});
    // Assets (images/videos) generated off these scenes — detach by setting
    // entityId to null would require nullable FK; instead delete the scene-owned assets.
    await p.asset.deleteMany({ where: { entityType: "SCENE", entityId: { in: oldSceneIds } } });
  }
  const deleted = await p.scene.deleteMany({ where: { episodeId: EPISODE_ID } });
  console.log(`✓ Deleted ${deleted.count} old scenes (+ frames/logs/assets)`);

  // 8. Insert 10 new scenes
  let created = 0;
  for (const s of parsed.scenes) {
    await p.scene.create({
      data: {
        parentType: "episode",
        parentId: EPISODE_ID,
        episodeId: EPISODE_ID,
        sceneNumber: s.number,
        title: s.title,
        summary: s.summary,
        scriptText: s.scriptText,
        scriptSource: "brain-10-scene-autogen",
        targetDurationSeconds: SCENE_DURATION_SEC,
        status: "DRAFT",
      },
    });
    created++;
  }
  console.log(`✓ Created ${created} new scenes`);

  // 9. Update episode targetDurationSeconds
  await p.episode.update({
    where: { id: EPISODE_ID },
    data: { targetDurationSeconds: SCENE_COUNT * SCENE_DURATION_SEC },
  });

  console.log(`\n✅ Done.`);
  console.log(`   Episode: ${ep.title}`);
  console.log(`   Scenes: ${created} × ${SCENE_DURATION_SEC}s = ${SCENE_COUNT * SCENE_DURATION_SEC}s total`);
  console.log(`   URL: /seasons/${ep.seasonId}/episodes/${ep.id}`);
  for (const s of parsed.scenes) {
    console.log(`   ${s.number}. ${s.title}`);
  }
  await p.$disconnect();
})();
