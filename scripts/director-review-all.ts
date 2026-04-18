/**
 * Full-episode director review + prompt rewrite.
 *
 * For each scene 1-10:
 *   1. Load current scriptText + directorSheet + bridgeFrameUrl / seedImageUrl
 *      + SC1 appearance reference (Maya's canonical look).
 *   2. Pass to Gemini-as-Director with the brain's cinematography refs +
 *      capabilities + the accumulated lesson memories (moderation, tone,
 *      continuity, bridge frame, delta-only remix).
 *   3. Director rewrites scriptText + directorSheet per:
 *        - Identity LOCK (Maya: auburn wavy hair, hazel eyes, olive-freckled
 *          skin, black silk robe)
 *        - Visual consistency (warm villa / mercury mirrors / golden dawn —
 *          not noir, not thriller, not dark)
 *        - Moderation safety (curiosity > dread, artist > soldier)
 *        - Bridge continuity (scene N opens at scene N-1's last frame)
 *        - Clean end frame (for i2v seeding of N+1; no fade except finale)
 *   4. Save back to DB (preserves old version in SceneLog).
 *
 * NO video regeneration — just prompt improvement. User decides what to
 * regen after reviewing the rewrites.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
if (!GEMINI) { console.error("GEMINI_API_KEY required"); process.exit(1); }

function log(m: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

const MAYA_CANON = `Maya Ellis — early-30s, auburn wavy hair worn loose or in a messy bun, warm hazel eyes, olive skin with soft freckles across the nose, lean athletic build. Wardrobe: black silk robe (for interior scenes) OR tailored dark clothing. No drift: same face, same features, same hair color across every clip. Lock to this description — never describe her as weary, shocked, terrified, or cold. Describe her expression as curious, quietly observant, gently determined, or softly surprised.`;

const SERIES_CANON = `"Echoes of Tomorrow" is a warm, character-driven cinematic drama. The world is a luminous modern villa on a cliff — mercury-finish mirror walls, obsidian floors, tall glass windows letting in golden dawn light, serene ocean views. The aesthetic is high-end cinema: Arri Alexa color science, warm amber/cream palette, natural film grain. NOT noir, NOT psychological thriller, NOT dystopian. Think elegant drama like "Past Lives" or "The Leftovers" quiet scenes — curiosity, wonder, emotional intimacy, gentle mystery.`;

async function callDirector(prompt: string): Promise<any> {
  const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 4000 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const d: any = await r.json();
    if (!r.ok) { if (r.status === 503 || r.status === 429) { log(`  ⚠ ${model} busy, trying next`); continue; } throw new Error(`Gemini: ${d?.error?.message}`); }
    const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    const jsonStr = firstBrace >= 0 && lastBrace > firstBrace ? raw.slice(firstBrace, lastBrace + 1) : raw;
    try { return { ...JSON.parse(jsonStr), usedModel: model }; }
    catch (e: any) { log(`  ⚠ ${model} parse fail: ${e.message?.slice(0, 80)}`); continue; }
  }
  throw new Error("all Gemini models exhausted");
}

(async () => {
  log("━━━ DIRECTOR REVIEW — EP01 full pass ━━━");

  // Load brain knowledge ONCE (all scenes share the same references)
  const [refs, caps, brain] = await Promise.all([
    p.brainReference.findMany({
      where: { kind: "cinematography" },
      select: { name: true, shortDesc: true, longDesc: true },
      take: 25,
    }),
    p.brainReference.findMany({
      where: { kind: "capability", tags: { hasSome: ["continuity", "bridge", "i2v", "moderation", "prompt-engineering"] } },
      select: { name: true, shortDesc: true, longDesc: true },
      take: 15,
    }),
    p.dailyBrainCache.findFirst({ orderBy: { date: "desc" }, select: { identity: true } }),
  ]);
  const refsBlock = refs.map((r) => `- ${r.name}: ${r.shortDesc}`).join("\n");
  const capsBlock = caps.map((c) => `- ${c.name}: ${c.shortDesc}`).join("\n");
  log(`  loaded ${refs.length} cinematography refs + ${caps.length} capabilities`);

  const scenes = await p.scene.findMany({
    where: { episodeId: EPISODE_ID },
    orderBy: { sceneNumber: "asc" },
    select: { id: true, sceneNumber: true, title: true, summary: true, scriptText: true, memoryContext: true },
  });
  log(`  ${scenes.length} scenes to review\n`);

  const changes: Array<{ sc: number; title: string; beforeLen: number; afterLen: number; rationale: string }> = [];

  for (const s of scenes) {
    const mem: any = s.memoryContext ?? {};
    const prevSc = s.sceneNumber! > 1 ? scenes.find((x) => x.sceneNumber === s.sceneNumber! - 1) : null;
    const isFirst = s.sceneNumber === 1;
    const isLast = s.sceneNumber === scenes.length;

    const prompt = `You are the AI Director of "Echoes of Tomorrow". Rewrite Scene ${s.sceneNumber}'s scriptText + directorSheet to fix two recurring failure modes:
  (a) Maya drifted in identity from SC3 onwards (different face, different wardrobe).
  (b) Scene-to-scene continuity broke (each clip looks like a different show).

SERIES CANON:
${SERIES_CANON}

MAYA CANON (LOCK):
${MAYA_CANON}

BRAIN IDENTITY:
${brain?.identity?.slice(0, 400) ?? "(none)"}

CINEMATOGRAPHY REFERENCES:
${refsBlock}

RELEVANT CAPABILITIES / LESSONS:
${capsBlock}

CONTEXT:
Scene ${s.sceneNumber} — "${s.title}"
Summary: ${s.summary}
Current scriptText (${s.scriptText?.length ?? 0} chars):
${s.scriptText?.slice(0, 1200)}

${prevSc ? `PREVIOUS SCENE (SC${prevSc.sceneNumber} "${prevSc.title}"):
Summary: ${prevSc.summary}
(scene ${s.sceneNumber} must open EXACTLY at SC${prevSc.sceneNumber}'s final pixel state.)` : "This is Scene 1 — the episode opener."}

YOUR TASK:
Rewrite the scriptText + directorSheet so the clip:
1. LOCKS Maya's identity to the canon above (reuse the exact phrase "auburn wavy hair, warm hazel eyes, olive-freckled skin, black silk robe").
2. Matches the warm-villa / mercury-mirror / golden-dawn aesthetic (NOT noir, NOT psychological thriller, NOT dark basement, NOT dystopian).
3. Uses curiosity / wonder / gentle realization as the emotional register (NOT dread / shock / cold determination).
4. ${isFirst ? "Opens with the mandatory SEASON 1 · EPISODE 1 title card (0-2s)." : "Opens at SC" + (s.sceneNumber! - 1) + "'s final frame — same Maya, same room, same lighting."}
5. ${isLast ? "Ends on a slow fade-to-black (episode finale)." : "Ends on a clean, stable frame (bridge for SC" + (s.sceneNumber! + 1) + ")."}
6. Stays under 900 chars in scriptText.
7. Avoids Sora moderation triggers: soldier / military / weapon / violence / crime / thriller / noir / paranoid / psychological / dread / shock / dark-basement.

Respond with ONLY valid JSON, no prose around it:
{
  "scriptText": "new 20s script with [TIME] beats, English only",
  "directorSheet": {
    "style": "warm villa aesthetic description",
    "scene": "location + lighting",
    "character": "Maya canon description",
    "shots": "shot-by-shot timing",
    "camera": "lens + movement",
    "effects": "or 'none'",
    "audio": "music + SFX direction — warm, NOT thriller",
    "technical": "24fps / aspect / bitrate"
  },
  "directorNotes": "2-3 sentences naming continuity techniques applied",
  "rationale": "one sentence: what changed and why"
}`;

    log(`─── SC${s.sceneNumber} "${s.title}"`);
    let revised: any;
    try {
      revised = await callDirector(prompt);
    } catch (e: any) {
      log(`  ❌ director err: ${e.message?.slice(0, 120)}`);
      continue;
    }
    log(`  ✓ ${revised.usedModel} · ${revised.scriptText?.length} chars`);
    log(`  rationale: ${revised.rationale}`);

    // Archive old version in SceneLog + save revision
    await (p as any).sceneLog.create({
      data: {
        sceneId: s.id,
        action: "director_full_review",
        actor: "system:director-review-all",
        actorName: "AI Director (full EP review)",
        details: {
          before: { scriptText: s.scriptText, directorSheet: mem.directorSheet },
          rationale: revised.rationale,
        },
      },
    }).catch(() => {});

    await p.scene.update({
      where: { id: s.id },
      data: {
        scriptText: revised.scriptText,
        scriptSource: "brain-full-review",
        memoryContext: {
          ...mem,
          directorSheet: revised.directorSheet,
          directorNotes: revised.directorNotes,
          lastReviewRationale: revised.rationale,
        } as any,
      },
    });

    changes.push({
      sc: s.sceneNumber!,
      title: s.title ?? "",
      beforeLen: s.scriptText?.length ?? 0,
      afterLen: revised.scriptText?.length ?? 0,
      rationale: revised.rationale,
    });
  }

  log(`\n━━━ REVIEW DONE — ${changes.length}/${scenes.length} scenes updated ━━━\n`);
  for (const c of changes) {
    log(`SC${String(c.sc).padStart(2, "0")} "${c.title}" · ${c.beforeLen} → ${c.afterLen} chars`);
    log(`    ↳ ${c.rationale}`);
  }
  log(`\nNo video regeneration performed. User can now review the updated scripts and decide which to regenerate.`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
