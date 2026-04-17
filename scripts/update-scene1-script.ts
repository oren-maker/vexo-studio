import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const s = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 } });
  if (!s) { console.error("no scene"); return; }
  const char = await p.character.findFirst({ where: { name: { contains: "Maya" } } });

  const newScript = `Visual Style: Intimate psychological thriller. Shot on Arri Alexa 65 with Panavision C-Series anamorphic lens, 40mm, f/2.0. Natural morning light with warm 4500K color temperature. 35mm film grain, shallow depth of field. Photorealistic live-action, real actors with visible skin pores.

CHARACTER: Maya Ellis (33) — olive skin with subtle freckles, sharp jawline, dark brown wavy hair pulled into a loose messy bun, wearing a charcoal oversized silk robe, lean athletic build. ${(char?.appearance ?? "").slice(0, 200)}

TITLE OVERLAY: Large clean white sans-serif text "SEASON 1 · EPISODE 1" centered on screen with 15% safe margins. Appears during the aerial approach (00:02-00:05) and fades out smoothly. A warm narrator voice reads "Season One, Episode One" in English, in sync with the text.

Timeline:
00:00-00:02: AERIAL ESTABLISHING SHOT. Bird's-eye view of a quiet suburban neighborhood at dawn. Soft golden light. Green trees lining a residential street. The camera begins descending.
00:02-00:05: DESCENDING CRANE SHOT. Camera swoops down toward a specific two-story house with a small front garden. Title text "SEASON 1 · EPISODE 1" appears overlaid. Narrator reads it aloud.
00:05-00:08: PUSH-IN TO HOUSE. Camera glides toward the front door, passes through it (seamless transition) into a dim hallway. Morning light streams through a side window.
00:08-00:11: TRACKING SHOT THROUGH HALLWAY. Camera moves smoothly past a coat rack, framed photos on the wall, toward a half-open bathroom door at the end. Soft ambient sounds: clock ticking, distant birds.
00:11-00:14: ENTERING BATHROOM. Camera pushes through the doorway into a modern bathroom. Maya stands at the marble sink, looking into the mirror. Her reflection stares back. Water drips from the tap — close-up of droplets hitting porcelain.
00:14-00:15: CLOSE-UP ON MAYA'S FACE in the mirror. Her expression shifts from neutral to confused — a micro-expression of doubt crosses her features. Her reflection seems to blink out of sync.

Audio: Continuous cinematic score — solo piano with soft pad underneath, 70 BPM, building subtle tension. Foley: birds chirping (exterior), footsteps on wooden floor, clock ticking, water dripping on porcelain, fabric rustling as Maya shifts. The score intensifies slightly at 00:14 when the reflection blinks.

ENDING: Last 1 second — quick, clean fade to black. Audio ducks to silence.`;

  await p.scene.update({ where: { id: s.id }, data: { scriptText: newScript } });
  console.log(`✅ scriptText updated (${newScript.length} chars)`);
  console.log(`Head: ${newScript.slice(0, 200)}`);
  await p.$disconnect();
})();
