/**
 * Batch version of generate-ep01-scenes. Iterates every episode of a target
 * season, replaces its scenes with 10 × 20s new scenes driven by Gemini with
 * full brain context + series bible + cast + continuity. Outputs a live
 * per-episode progress log.
 *
 * Target: "Echoes of Tomorrow" Season 1 (9 episodes). EP01 is already done
 * and will be skipped — override with --include-ep01 if you want to rerun.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const SEASON_ID = "cmny2goc10007u7yrbs849yo4"; // Echoes of Tomorrow · S1
const SCENE_COUNT = 10;
const SCENE_DURATION_SEC = 20;
const SKIP_DONE = !process.argv.includes("--include-ep01");
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error("GEMINI_API_KEY missing"); process.exit(1); }

async function callGemini(system: string, user: string): Promise<string> {
  const models = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"];
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
            generationConfig: { temperature: 0.9, maxOutputTokens: 16384, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!res.ok) { continue; }
      const json: any = await res.json();
      const reply = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (reply) return reply;
    } catch {/* try next */}
  }
  throw new Error("all Gemini models failed");
}

async function regenerateOneEpisode(episodeId: string, brainCtx: {
  byKind: Record<string, string[]>;
  daily: any; guides: any[]; nodes: any[]; analysis: any;
}): Promise<{ created: number; error?: string }> {
  const ep: any = await p.episode.findUnique({
    where: { id: episodeId },
    include: {
      season: { include: { series: { select: { title: true, summary: true, genre: true } } } },
      scenes: { orderBy: { sceneNumber: "asc" } },
      characters: { include: { character: { select: { name: true, roleType: true, appearance: true, personality: true } } } },
    },
  });
  if (!ep) return { created: 0, error: "episode not found" };

  const system = `You are a senior TV showrunner + cinematographer writing the complete shot-list for a single episode of an AI-directed Hebrew-Israeli psychological thriller series.

OUTPUT CONTRACT (strict JSON, no prose, no markdown fences):
{"scenes":[{"number":1,"title":"<2-5 words>","summary":"<one Hebrew sentence — what happens>","scriptText":"<full English Sora 2 prompt, 300-500 words>"}, ... exactly ${SCENE_COUNT} entries ...]}

scriptText STRUCTURE (8 mandatory sections, inline headers, NOT markdown):
1. Visual Style · 2. Lens & Camera · 3. Lighting · 4. Color Palette · 5. Character · 6. Environment · 7. Audio (foley + score) · 8. Timeline (0-5s / 5-12s / 12-18s / 18-20s beats)

DURATION HARD: every scene = exactly ${SCENE_DURATION_SEC}s.
STYLE HARD: photorealistic live-action, 35mm film, shallow DoF. NOT animation.

CONTINUITY HARD:
- Scenes are ONE connected story arc, not vignettes.
- Each scene's 18-20s beat MUST cause/motivate the next scene's 0-5s beat. Write the "hook" into the Timeline so Sora knows to end mid-gesture.
- Same cast continues; wardrobe identical unless story demands change.
- Location jumps must be explained in the prior scene's dialogue/action.
- Follow the full ARC: setup → inciting incident → escalation → midpoint → crisis → resolution.

EPISODE-END FADE-OUT — HARD:
The LAST scene (#${SCENE_COUNT}) must end with a 1.5s fade-to-black (18.5-20s), audio ducks to silence. Add to Visual Style: "final frame fades to pure black — continuity bridge to next episode". Scenes 1-9 NEVER fade — hard-cut.`;

  const user = `SERIES: ${ep.season.series.title}
GENRE: ${ep.season.series.genre ?? "Psychological thriller"}
SERIES SUMMARY: ${ep.season.series.summary ?? "(none)"}

EPISODE ${ep.episodeNumber}: "${ep.title}"
EPISODE SYNOPSIS: ${ep.synopsis}
TARGET DURATION: ${SCENE_COUNT * SCENE_DURATION_SEC} seconds total (${SCENE_COUNT} × ${SCENE_DURATION_SEC}s)

EXISTING BEATS (for reference — rewrite in 10 scenes, don't copy):
${ep.scenes.map((s: any) => `  Scene ${s.sceneNumber}: ${s.title} — ${s.summary?.slice(0, 140) ?? ""}`).join("\n")}

CHARACTERS:
${ep.characters.map((c: any) => `  - ${c.character.name} (${c.character.roleType}): ${(c.character.appearance ?? "").slice(0, 120)}`).join("\n")}

BRAIN — emotions:
${(brainCtx.byKind.emotion ?? []).slice(0, 15).join("\n")}

BRAIN — sound:
${(brainCtx.byKind.sound ?? []).slice(0, 15).join("\n")}

BRAIN — cinematography:
${(brainCtx.byKind.cinematography ?? []).slice(0, 15).join("\n")}

BRAIN — capabilities:
${(brainCtx.byKind.capability ?? []).slice(0, 20).join("\n")}

BRAIN IDENTITY: ${brainCtx.daily?.identity?.slice(0, 400) ?? "(none)"}
TODAY'S LEARNINGS: ${brainCtx.daily?.todayLearnings?.slice(0, 300) ?? "(none)"}

GUIDES (top 20): ${brainCtx.guides.map((g: any) => g.translations?.[0]?.title ?? g.slug).slice(0, 20).join(" · ")}

SERIES ANALYSIS: ${brainCtx.analysis?.summary?.slice(0, 500) ?? "(none)"}

Return JSON only.`;

  let raw: string;
  try { raw = await callGemini(system, user); }
  catch (e: any) { return { created: 0, error: `gemini: ${e.message}` }; }

  let parsed: { scenes: Array<{ number: number; title: string; summary: string; scriptText: string }> };
  try {
    let txt = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const first = txt.indexOf("{"); const last = txt.lastIndexOf("}");
    if (first >= 0 && last > first) txt = txt.slice(first, last + 1);
    parsed = JSON.parse(txt);
  } catch (e: any) { return { created: 0, error: `parse: ${e.message}` }; }
  if (!parsed?.scenes || parsed.scenes.length !== SCENE_COUNT) {
    return { created: 0, error: `wrong scene count: ${parsed?.scenes?.length ?? 0}` };
  }

  // Snapshot to disk
  const fs = await import("fs");
  fs.mkdirSync("./scripts/snapshots", { recursive: true });
  fs.writeFileSync(`./scripts/snapshots/ep${ep.episodeNumber}-pre-${Date.now()}.json`, JSON.stringify(ep.scenes, null, 2));

  // Clear FK dependents
  const oldIds = ep.scenes.map((s: any) => s.id);
  if (oldIds.length > 0) {
    await p.sceneFrame.deleteMany({ where: { sceneId: { in: oldIds } } });
    await (p as any).sceneLog?.deleteMany({ where: { sceneId: { in: oldIds } } }).catch(() => {});
    await p.asset.deleteMany({ where: { entityType: "SCENE", entityId: { in: oldIds } } });
  }
  await p.scene.deleteMany({ where: { episodeId } });

  // Insert new + detect which cast actually appears per scene so Sora's
  // cast filter in /generate-video passes only those to the model.
  const castList = ep.characters.map((c: any) => c.character.name);
  for (const s of parsed.scenes) {
    const text = [s.title, s.summary, s.scriptText].filter(Boolean).join(" ").toLowerCase();
    const present = castList.filter((name: string) => {
      const parts = name.toLowerCase().split(/\s+/);
      if (text.includes(name.toLowerCase())) return true;
      if (parts.length >= 2) {
        if (parts[0].length >= 3 && text.includes(parts[0])) return true;
        if (parts[parts.length - 1].length >= 3 && text.includes(parts[parts.length - 1])) return true;
      }
      return false;
    });
    await p.scene.create({
      data: {
        parentType: "episode", parentId: episodeId, episodeId,
        sceneNumber: s.number, title: s.title, summary: s.summary, scriptText: s.scriptText,
        scriptSource: "brain-10-scene-autogen",
        targetDurationSeconds: SCENE_DURATION_SEC,
        status: "STORYBOARD_APPROVED",
        memoryContext: { characters: present } as any,
      },
    });
  }
  await p.episode.update({
    where: { id: episodeId },
    data: { targetDurationSeconds: SCENE_COUNT * SCENE_DURATION_SEC },
  });
  return { created: parsed.scenes.length };
}

(async () => {
  const episodes = await p.episode.findMany({
    where: { seasonId: SEASON_ID },
    orderBy: { episodeNumber: "asc" },
    select: { id: true, episodeNumber: true, title: true, scenes: { select: { id: true, scriptSource: true } } },
  });
  console.log(`Season ${SEASON_ID}: ${episodes.length} episodes\n`);

  // Preload brain context once (same for all episodes)
  const refs = await p.brainReference.findMany({
    where: { kind: { in: ["emotion", "sound", "cinematography", "capability"] } },
    orderBy: [{ kind: "asc" }, { order: "asc" }],
    select: { kind: true, name: true, shortDesc: true },
  });
  const byKind: Record<string, string[]> = refs.reduce((acc, r) => {
    (acc[r.kind] ??= []).push(`${r.name}${r.shortDesc ? ` — ${r.shortDesc.slice(0, 80)}` : ""}`);
    return acc;
  }, {} as Record<string, string[]>);
  const daily: any = await p.dailyBrainCache.findFirst({ orderBy: { date: "desc" } });
  const guides: any = await p.guide.findMany({
    orderBy: { viewCount: "desc" }, take: 20,
    select: { slug: true, translations: { select: { title: true }, take: 1 } },
  });
  const nodes: any = await p.knowledgeNode.findMany({
    orderBy: { confidence: "desc" }, take: 30, select: { type: true, title: true },
  });
  const analysis: any = await p.insightsSnapshot.findFirst({
    where: { kind: "series_analysis" }, orderBy: { takenAt: "desc" }, select: { summary: true },
  });
  const brainCtx = { byKind, daily, guides, nodes, analysis };

  for (let i = 0; i < episodes.length; i++) {
    const e = episodes[i];
    const alreadyDone = e.scenes.length === SCENE_COUNT && e.scenes.every((s) => s.scriptSource === "brain-10-scene-autogen");
    const label = `[${i + 1}/${episodes.length}] EP${String(e.episodeNumber).padStart(2, "0")} "${e.title}"`;
    if (alreadyDone && SKIP_DONE) {
      console.log(`${label} — skipping (already has ${SCENE_COUNT} brain-autogen scenes)`);
      continue;
    }
    process.stdout.write(`${label} — regenerating… `);
    const t0 = Date.now();
    const result = await regenerateOneEpisode(e.id, brainCtx);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (result.error) {
      console.log(`✗ (${secs}s) ${result.error}`);
    } else {
      console.log(`✓ (${secs}s) created ${result.created}`);
    }
  }
  console.log(`\n✅ Done.`);
  await p.$disconnect();
})();
