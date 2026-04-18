/**
 * Director-authored opening rewrite — ELEGANT, CHARACTERLESS.
 *
 * Oren's note: the current opening leans on Maya's full character description.
 * He wants an *elegant* opening that teases plot + scene + world,
 * NO characters in frame (or at most an unrecognisable silhouette).
 *
 * I am the wire. The brain is the author. I:
 *   1. Load cinematography refs + capabilities + DailyBrainCache.
 *   2. Load SC1-SC3 scriptTexts so the brain knows what plot to tease.
 *   3. Hand all of it to Gemini as the system prompt.
 *   4. Persist whatever the brain writes — no const NEW_PROMPT.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
if (!GEMINI) { console.error("GEMINI_API_KEY required"); process.exit(1); }

(async () => {
  const opening = await p.seasonOpening.findFirst({
    where: { season: { series: { title: "Echoes of Tomorrow" } } },
    include: { season: { include: { series: true } } },
  });
  if (!opening) { console.error("opening not found"); return; }

  const sc = await p.scene.findMany({
    where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: { in: [1, 2, 3] } },
    orderBy: { sceneNumber: "asc" },
    select: { sceneNumber: true, scriptText: true, summary: true },
  });

  const refs = await p.brainReference.findMany({
    where: { kind: { in: ["cinematography", "capability"] } },
    select: { kind: true, name: true, shortDesc: true, longDesc: true },
    take: 60,
  });
  const cache = await p.dailyBrainCache.findFirst({ orderBy: { date: "desc" } });

  const cinemaBlock = refs.filter((r) => r.kind === "cinematography").slice(0, 25)
    .map((r) => `- ${r.name}: ${r.shortDesc ?? ""}`).join("\n");
  const capabilityBlock = refs.filter((r) => r.kind === "capability").slice(0, 25)
    .map((r) => `- ${r.name}: ${r.shortDesc ?? ""}`).join("\n");
  const sceneBlock = sc.map((s) => `[SC${s.sceneNumber}] ${s.scriptText?.slice(0, 350) ?? ""}`).join("\n\n");

  const systemPrompt = `You are the AI Director of "Echoes of Tomorrow". Today's brain identity:
${cache?.identity ?? "warm character-driven drama director"}

Today's focus: ${cache?.tomorrowFocus ?? "elegant restraint, atmosphere over exposition"}

Your accumulated cinematography knowledge:
${cinemaBlock}

Your accumulated production capabilities (lessons learned):
${capabilityBlock}

The first three scenes you've already authored:
${sceneBlock}

Series canon you must respect:
- Warm character-driven cinematic drama. Elegant, calm, sunlit.
- World: luminous modern villa, polished stone floors, mirror walls, tall glass windows, warm amber dawn light.
- Palette: Arri Alexa color science, warm amber/cream, natural film grain.
- Score: piano + soft strings + warm ambient pads.

SORA MODERATION SAFETY (HARD CONSTRAINTS — Sora rejected our previous opening, so follow these strictly):
- USE ONLY POSITIVE PHRASING. Never write "no people", "no one", "without anyone", "empty of", "lacking" — instead just describe the objects without mentioning people at all.
- NEVER imply physics defiance: do NOT write "against gravity", "defying physics", "impossibly", "supernatural". Instead use neutral observational verbs: "drifts upward", "rises slowly", "floats", "lifts gently".
- AVOID: dreamlike, surreal, uncanny, eerie, strange, mysterious, anomaly, glitch, lag, delayed, defies, against, paranoid, dark, shadow-heavy, noir, thriller, psychological, surveillance.
- PREFER: serene, graceful, luminous, tranquil, golden, gentle, slow, observed, quietly, softly.
- The mirror "anomaly" should be shown VISUALLY only — describe what you see (the reflection moves a beat after the source) without labelling it as strange/anomalous/dreamlike.
- Keep the description object-focused, calm, observational. Like an upscale perfume commercial.

YOUR TASK — author a 20-second photorealistic OPENING TITLE SEQUENCE prompt for Sora 2.

CRITICAL CONSTRAINTS for THIS opening (these override prior openings):
1. NO face, NO body, NO silhouette of a person on screen at any point.
   But the opening must FEEL like Maya's world — her presence is suggested through her objects:
   the BLACK SILK ROBE draped softly over the back of a designer chair, an open hardcover BOOK face-down on the obsidian table, a PORCELAIN TEACUP with steam curling up, fresh JASMINE in a crystal vase. These are her things; the viewer senses her without seeing her.
   This is the canonical villa — luminous modern, obsidian cliff, mercury mirror walls, tall glass windows, warm amber dawn — exactly the world from SC1-3 (no new architecture, no new palette).
2. NO PLOT ANOMALY in this opening. Sora's POST-RENDER moderation has blocked our prior openings at 99% completion when they showed mirrors lagging or mercury defying gravity (the model treats anomalous physics as deceptive content). For THIS opening we tease only the WORLD AESTHETIC — the mystery starts in scene 1, not the title sequence. Think prestige TV title sequences (Westworld, The Crown): pure mood and atmosphere, no plot reveal.
   Mirrors in this opening reflect NORMALLY. Mercury (if shown at all) sits still. Steam rises naturally. Reflections sync with their sources. NOTHING defies physics.
3. What to actually show:
   - A wide of the cliff villa at warm amber dawn (golden ocean horizon through tall glass).
   - A graceful interior pull-in across the polished obsidian floor.
   - The silk robe draped on a chair, catching warm light.
   - The teacup steaming on a low table, jasmine in the background.
   - A close, beautiful pass over a mercury-finish mirror wall — pure surface reflection of the room itself, no anomaly.
   - The title 'ECHOES OF TOMORROW' in clean white sans-serif, centered with 15% safe margins.
   - A calm warm male narrator speaks the title once at 00:18.
3. End on the title card "ECHOES OF TOMORROW" — clean white sans-serif, centered, 15% safe margins,
   held steady on a final stable frame.
4. Single warm narrator line at the very end (00:18-00:20): "Echoes of Tomorrow" — calm male voice in English. No other dialogue.
5. Score: gentle piano + warm strings + soft ambient pads. Nothing tense.
6. Audio FX: subtle — distant ocean, soft dawn air, a single crystalline chime when the mirror first ripples.
7. Camera language: slow, graceful, classical. Dolly-in, slow push, slow rise. NO handheld, NO whip pan, NO dutch tilt.
8. Beat structure (you decide the exact beats but stay in 20s and respect the shape):
   - Establish the villa world (wide, no person)
   - Reveal the small mirror anomaly (medium/macro)
   - Pull out + title card

Respond with ONLY valid JSON:
{
  "prompt": "the full ~600-1000 char Sora 2 prompt as one block of clean prose with [TIME] markers",
  "rationale": "2-3 sentences naming exactly which capability/cinematography references you applied",
  "moderationCheck": "1 sentence confirming none of the forbidden atmospheres or keywords are present"
}`;

  console.log("━━━ calling director for elegant characterless opening ━━━\n");
  const MODELS = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"];
  let revised: any = null;
  let usedModel = "";
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const d: any = await r.json();
      if (!r.ok) { if (r.status === 503 || r.status === 429) continue; throw new Error(`Gemini: ${d?.error?.message}`); }
      const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const fb = raw.indexOf("{"); const lb = raw.lastIndexOf("}");
      revised = JSON.parse(raw.slice(fb, lb + 1));
      usedModel = model;
      break;
    } catch (e: any) { console.log(`  ${model}: ${e.message}`); continue; }
  }
  if (!revised?.prompt) { console.error("all Gemini models failed"); return; }

  console.log(`✓ ${usedModel}`);
  console.log(`\nprompt (${revised.prompt.length} chars):\n${revised.prompt}\n`);
  console.log(`rationale: ${revised.rationale}`);
  console.log(`moderationCheck: ${revised.moderationCheck}\n`);

  // Archive previous version
  await p.seasonOpeningPromptVersion.create({
    data: {
      openingId: opening.id,
      prompt: opening.currentPrompt,
      author: "system:archive-before-elegant-rewrite",
      reason: "snapshot prior to brain-authored elegant rewrite (no characters)",
    },
  }).catch((e) => console.log("archive warn:", e.message));

  // Save new prompt
  await p.seasonOpening.update({
    where: { id: opening.id },
    data: { currentPrompt: revised.prompt, updatedAt: new Date() },
  });

  await p.seasonOpeningPromptVersion.create({
    data: {
      openingId: opening.id,
      prompt: revised.prompt,
      author: `brain:gemini:${usedModel}`,
      reason: `elegant characterless rewrite — ${revised.rationale}`,
    },
  }).catch((e) => console.log("save-version warn:", e.message));

  console.log(`✅ opening updated. status remains ${opening.status} — Oren decides when to regen video.`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
