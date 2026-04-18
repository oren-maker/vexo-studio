/**
 * Director targeted rewrite for SC3 with explicit narrative bridge from SC2.
 *
 * The bridge: SC2 establishes a reflection-delay that the Villa AI
 * passes off as "recalibrating grace". SC3 must escalate that physically —
 * the delay isn't a glitch, the mirror itself is liquid/mercury-like and
 * the reflection has its own agency, inviting Maya through.
 *
 * Key requirements:
 *   1. OPEN at SC2's exact final beat: Maya's hand raised, facing mirror.
 *   2. Escalate physically: her finger contacts glass → glass yields → she
 *      pulls back surprised → she leans in again → by 00:20 she's partially
 *      crossed the threshold (or her reflection has reached forward for her).
 *   3. Emotional escalation: curiosity → invitation (NOT dread).
 *   4. Keep: warm amber dawn, mercury mirrors, Maya's canon (auburn hair,
 *      black silk robe), obsidian floor.
 *   5. End on a CLEAN frame for SC4 to seed from.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const GEMINI = process.env.GEMINI_API_KEY?.replace(/\\n$/, "");
if (!GEMINI) { console.error("GEMINI_API_KEY required"); process.exit(1); }

(async () => {
  const sc2 = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 2 } });
  const sc3 = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 3 } });
  if (!sc2 || !sc3) { console.error("scenes missing"); return; }

  const prompt = `You are the AI Director of "Echoes of Tomorrow". SC1 and SC2 already connect well (Maya, warm villa, mercury mirrors, reflection-lag reveal). SC3 is the next beat and must LAND the gear-turn that SC2 set up.

SC2 IS SEALED — Maya ended facing a mercury mirror with her hand raised, watching her reflection align half a second late; the Villa AI calling it "Visual feedback recalibrating, just a moment of grace"; Maya's gaze intrigued and steady. Dawn light, amber palette, black silk robe, auburn hair, obsidian floor.

SC3 MUST:
1. Open literally at SC2's final frame — same hand still raised, same Maya.
2. ESCALATE the reflection-delay physically: her finger contacts the glass and the glass yields like liquid mercury. This isn't a glitch — the "recalibrating grace" the Villa AI mentioned was the truth dressed up softly. The mirror is permeable. There's an intelligence on the other side.
3. Emotional register: wonder + invitation (not dread, not shock). Maya smiles softly when she realizes what's happening.
4. Physical beats across 20s:
   0-4s: finger contacts glass, mercury ripples outward with a crystalline chime.
   4-9s: Maya pulls hand back; a droplet of mercury clings to her fingertip, then re-merges with the surface.
   9-14s: her reflection, with a half-beat of its own agency, reaches forward first. Maya's eyes widen with gentle delight.
   14-20s: Maya leans in. Her hand sinks through the surface up to the wrist. The mirror glows warmly around the contact. Final frame: Maya's arm in the mirror, her face in profile, dawn light steady, a calm expression of discovery.
5. Keep Maya's canon: auburn wavy hair, warm hazel eyes, olive-freckled skin, black silk robe.
6. Warm amber palette, mercury mirrors, obsidian floor. NO noir, NO thriller, NO dark basement, NO fear.
7. End on a clean stable frame (NOT mid-motion, NOT fade-to-black) — this seeds SC4.
8. Avoid Sora moderation triggers: no soldier, weapon, crime, paranoid, psychological, dread, shock, cold, thriller, noir, surveillance.

Respond with ONLY valid JSON:
{
  "scriptText": "new 20s script with [TIME] beats in English, ≤900 chars",
  "directorSheet": {
    "style": "warm villa + mercury mirrors description",
    "scene": "location + dawn lighting",
    "character": "Maya canonical description repeated verbatim",
    "shots": "beat-by-beat with timing",
    "camera": "lens + movement",
    "effects": "mercury ripple + amber glow",
    "audio": "crystalline chime + soft strings + Villa AI whisper — NO thriller score",
    "technical": "24fps / 1280x720 / warm amber grade"
  },
  "directorNotes": "3 sentences naming the continuity techniques: match-cut from SC2 + 180-line + OTS",
  "narrativeBridge": "explicit sentence: how SC2's 'reflection delay' escalates into SC3's 'mirror yields'"
}`;

  console.log("━━━ calling director for SC3 targeted rewrite ━━━\n");
  const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  let revised: any = null;
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 3500 } }),
      signal: AbortSignal.timeout(60_000),
    });
    const d: any = await r.json();
    if (!r.ok) { if (r.status === 503 || r.status === 429) continue; throw new Error(`Gemini: ${d?.error?.message}`); }
    const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const fb = raw.indexOf("{"); const lb = raw.lastIndexOf("}");
    try { revised = { ...JSON.parse(raw.slice(fb, lb + 1)), usedModel: model }; break; }
    catch { continue; }
  }
  if (!revised) { console.error("all Gemini models failed"); return; }

  console.log(`✓ ${revised.usedModel}`);
  console.log(`\nscriptText (${revised.scriptText?.length} chars):`);
  console.log(revised.scriptText);
  console.log(`\ndirectorNotes: ${revised.directorNotes}`);
  console.log(`\nnarrativeBridge: ${revised.narrativeBridge}`);

  // Save
  const mem3: any = sc3.memoryContext ?? {};
  await (p as any).sceneLog.create({
    data: {
      sceneId: sc3.id,
      action: "director_targeted_rewrite",
      actor: "system:rewrite-sc3",
      actorName: "Director (SC2→SC3 bridge)",
      details: {
        before: { scriptText: sc3.scriptText, directorSheet: mem3.directorSheet },
        narrativeBridge: revised.narrativeBridge,
      },
    },
  }).catch(() => {});
  await p.scene.update({
    where: { id: sc3.id },
    data: {
      scriptText: revised.scriptText,
      scriptSource: "brain-targeted-sc3",
      memoryContext: {
        ...mem3,
        directorSheet: revised.directorSheet,
        directorNotes: revised.directorNotes,
        narrativeBridge: revised.narrativeBridge,
      } as any,
    },
  });
  console.log(`\n✅ SC3 updated in DB — no video regen performed`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
