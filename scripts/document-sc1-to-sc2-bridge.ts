/**
 * SC2 is already working well in production. This script does NOT rewrite
 * it — instead it asks the Director (brain-as-author, per the standing
 * rule re-affirmed 2026-04-18) to WRITE TWO FORMAL ENTRIES documenting
 * the existing scene so future regenerations inherit the discipline:
 *   1. narrativeBridge: how SC2 continues from SC1's final beat.
 *   2. identityLock: the specific textual anchors that prevent Maya from
 *      drifting (what phrases to reuse verbatim in every future prompt).
 *
 * Director input:
 *   - SC1 + SC2 full scriptText (they work — don't change the art).
 *   - BrainReference cinematography + capability refs.
 *   - DailyBrainCache identity.
 *
 * Output persisted to SC2.memoryContext.narrativeBridge and .identityLock
 * so downstream tools (chain-all-scenes, regen, remix) can read them.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
if (!GEMINI) { console.error("GEMINI_API_KEY required"); process.exit(1); }

(async () => {
  const sc1 = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 } });
  const sc2 = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 2 } });
  if (!sc1 || !sc2) { console.error("scenes missing"); return; }

  // Gather brain context — the rule says I must feed the brain its own
  // knowledge base before asking it to author anything creative/professional.
  const [refs, caps, brain] = await Promise.all([
    p.brainReference.findMany({
      where: { kind: "cinematography" },
      select: { name: true, shortDesc: true, longDesc: true },
      take: 20,
    }),
    p.brainReference.findMany({
      where: { kind: "capability", tags: { hasSome: ["continuity", "bridge", "i2v", "moderation"] } },
      select: { name: true, shortDesc: true },
      take: 10,
    }),
    p.dailyBrainCache.findFirst({ orderBy: { date: "desc" }, select: { identity: true, todayLearnings: true } }),
  ]);
  const refsBlock = refs.map((r) => `- ${r.name}: ${r.shortDesc}`).join("\n");
  const capsBlock = caps.map((c) => `- ${c.name}: ${c.shortDesc}`).join("\n");

  const prompt = `You are the AI Director of "Echoes of Tomorrow". SC1 and SC2 are already rendered and BOTH are successful — Maya's identity held, the warm villa aesthetic held, the reflection-lag reveal landed. DO NOT rewrite them.

Your job: produce TWO FORMAL ANALYTICAL ENTRIES that document WHY this pair works, so future regenerations and downstream scenes can inherit the discipline.

BRAIN IDENTITY:
${brain?.identity?.slice(0, 400) ?? "(none)"}

CINEMATOGRAPHY REFERENCES (your knowledge base):
${refsBlock}

CAPABILITIES / ACCUMULATED LESSONS:
${capsBlock}

SC1 "The Descent" — FINAL (in production):
${sc1.scriptText}

SC2 "The Lag" — FINAL (in production):
${sc2.scriptText}

Produce TWO entries:

1. narrativeBridge — explain IN DETAIL how SC2's opening beat matches SC1's closing beat, and what PLOT GEAR turns from SC1 → SC2. Name the specific cinematographic technique that links them (match cut / OTS continuation / eyeline / etc.). Say what EMOTIONAL BEAT escalates from SC1 to SC2 (wonder at sight → wonder at discovery of anomaly, etc.). Reference exact seconds.

2. identityLock — a DEFINITIVE CANONICAL DESCRIPTION of Maya that every future scene's prompt must reuse VERBATIM to prevent drift. Include: (a) exact phrase for her face/hair/eyes/skin/build, (b) the wardrobe formula for interior vs exterior, (c) the FORBIDDEN adjectives (weary, shocked, terrified, cold, haggard) — listed explicitly so the brain remembers not to use them, (d) the PREFERRED adjectives (curious, quietly observant, gently determined, softly surprised) as the emotional palette, (e) lighting formula (warm amber dawn + mercury mirror reflections) repeated verbatim.

Respond with ONLY valid JSON:
{
  "narrativeBridge": {
    "sc1FinalBeat": "string describing SC1's last 2-3 seconds",
    "sc2OpeningBeat": "string describing SC2's first 2-3 seconds",
    "matchTechnique": "named cinematographic technique",
    "plotGear": "sentence naming the plot turn",
    "emotionalEscalation": "sentence naming the emotional arc",
    "fullBridgeExplanation": "3-4 sentence paragraph tying it all together"
  },
  "identityLock": {
    "canonicalFaceAndBody": "exact verbatim phrase to reuse",
    "interiorWardrobe": "exact phrase",
    "exteriorWardrobe": "exact phrase",
    "forbiddenAdjectives": ["list"],
    "preferredAdjectives": ["list"],
    "lightingFormula": "exact phrase"
  },
  "howToUseDownstream": "1-2 sentences instructing future director calls how to apply these locks in every new scene's scriptText"
}`;

  console.log("━━━ asking the Director (Gemini + brain context) ━━━\n");
  const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  let result: any = null;
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 3500 } }),
      signal: AbortSignal.timeout(60_000),
    });
    const d: any = await r.json();
    if (!r.ok) { if (r.status === 503 || r.status === 429) continue; throw new Error(`Gemini: ${d?.error?.message}`); }
    const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const fb = raw.indexOf("{"); const lb = raw.lastIndexOf("}");
    try { result = { ...JSON.parse(raw.slice(fb, lb + 1)), usedModel: model }; break; }
    catch { continue; }
  }
  if (!result) { console.error("all Gemini models failed"); return; }

  console.log(`✓ ${result.usedModel}\n`);
  console.log("═══════ NARRATIVE BRIDGE SC1 → SC2 ═══════");
  console.log(`SC1 final beat:  ${result.narrativeBridge.sc1FinalBeat}`);
  console.log(`SC2 opening:     ${result.narrativeBridge.sc2OpeningBeat}`);
  console.log(`Match technique: ${result.narrativeBridge.matchTechnique}`);
  console.log(`Plot gear:       ${result.narrativeBridge.plotGear}`);
  console.log(`Emotion:         ${result.narrativeBridge.emotionalEscalation}`);
  console.log(`\n${result.narrativeBridge.fullBridgeExplanation}`);

  console.log("\n═══════ IDENTITY LOCK — Maya canonical ═══════");
  console.log(`Face/body:   ${result.identityLock.canonicalFaceAndBody}`);
  console.log(`Interior:    ${result.identityLock.interiorWardrobe}`);
  console.log(`Exterior:    ${result.identityLock.exteriorWardrobe}`);
  console.log(`Forbidden:   ${result.identityLock.forbiddenAdjectives.join(", ")}`);
  console.log(`Preferred:   ${result.identityLock.preferredAdjectives.join(", ")}`);
  console.log(`Lighting:    ${result.identityLock.lightingFormula}`);

  console.log("\n═══════ HOW TO USE DOWNSTREAM ═══════");
  console.log(result.howToUseDownstream);

  // Persist to SC2 memoryContext
  const mem2: any = sc2.memoryContext ?? {};
  await p.scene.update({
    where: { id: sc2.id },
    data: {
      memoryContext: {
        ...mem2,
        narrativeBridge: result.narrativeBridge,
        identityLock: result.identityLock,
        howToUseDownstream: result.howToUseDownstream,
      } as any,
    },
  });

  // Episode doesn't have memoryContext — propagate identityLock to all
  // scenes in the episode so every future scene's director call inherits
  // the same canonical description without re-deriving.
  const allScenes = await p.scene.findMany({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6" } });
  for (const s of allScenes) {
    const m: any = s.memoryContext ?? {};
    await p.scene.update({
      where: { id: s.id },
      data: { memoryContext: { ...m, identityLock: result.identityLock } as any },
    });
  }
  console.log(`\n✓ identityLock propagated to all ${allScenes.length} scenes in the episode`);

  console.log(`\n✅ SC2 bridge + identity lock documented`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
