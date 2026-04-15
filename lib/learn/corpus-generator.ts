// Data-driven prompt generator. Uses the corpus insights (style signatures,
// co-occurrence pairs, top-performer patterns) to compose new prompts that
// follow the patterns we've learned actually work.
//
// This is NOT an LLM. It's a template engine fed by the corpus statistics.

import { prisma } from "./db";
import { computeCorpusInsights } from "./corpus-insights";

// 20 human-written subject seeds across diverse briefs — the generator will
// dress each one with style signatures + co-occurrence pairs + timecodes.
const SUBJECT_SEEDS: Array<{
  title: string;
  subject: string;
  location: string;
  action: string;
  preferredStyle?: string;
  preferredMood?: string;
  tags: string[];
}> = [
  { title: "Samurai Duel in Bamboo Rain", subject: "a masked ronin facing a straw-cloaked blademaster", location: "dense bamboo forest under heavy rain", action: "they circle, freeze, then clash in a single stroke", preferredStyle: "Wuxia", preferredMood: "Tense", tags: ["forest", "rain", "combat"] },
  { title: "Cyberpunk Noodle Vendor", subject: "a lone noodle vendor in a holographic night market", location: "Neo-Tokyo back alley, neon reflecting in puddles", action: "steam rises as he tosses noodles in a wok while a drone hovers nearby", preferredStyle: "Cyberpunk", preferredMood: "Intimate", tags: ["urban", "night", "food"] },
  { title: "Post-Apocalyptic Desert Runner", subject: "a weathered scavenger in tactical leather", location: "cracked salt flats under a dust-choked sun", action: "she sprints across the dunes clutching a metal canister, pursued by a sandstorm", preferredStyle: "Post-apocalyptic", preferredMood: "Gritty", tags: ["desert", "daytime", "combat"] },
  { title: "Underwater Dance of Bioluminescence", subject: "a ballerina suspended in deep ocean", location: "abyssal coral reef glowing with bioluminescent plankton", action: "she pirouettes in slow motion as schools of glowing fish swirl around her", preferredStyle: "Ethereal", preferredMood: "Ethereal", tags: ["ocean", "night", "dance"] },
  { title: "Japanese Classroom Quiet Confession", subject: "a pure girl writing notes and a boy stealing glances", location: "empty afternoon classroom with warm sunlight through blinds", action: "their eyes meet, she looks away, he whispers three words", preferredStyle: "Japanese drama", preferredMood: "Intimate", tags: ["daytime", "portrait"] },
  { title: "Hollywood Mecha Reveal", subject: "a luxury car morphing into a titanic robot", location: "rainy Tokyo intersection at midnight", action: "the car unfolds into Optimus-like mecha as a massive beast roars on the next block", preferredStyle: "Hollywood", preferredMood: "Epic", tags: ["urban", "night"] },
  { title: "Fashion Liquid Porcelain", subject: "an Asian haute couture model in blue-and-white porcelain dress", location: "infinite mirror-like salt flat under dark clouds", action: "she snaps her fingers and her dress explodes into ink-wash swallows", preferredStyle: "Editorial fashion", preferredMood: "Epic", tags: ["portrait"] },
  { title: "Modern Farmhouse Morning", subject: "a creator in linen harvesting from her garden", location: "open farmhouse kitchen with sunlight pouring through", action: "she picks a dewy tomato, slices it precisely, sits at a wooden table to eat", preferredStyle: "Cinematic", preferredMood: "Serene", tags: ["daytime", "food"] },
  { title: "Sky Battlefield on Floating Rocks", subject: "a masked ronin leaping across drifting stone islands", location: "stormy sky with floating platforms and lightning", action: "he rides a bolt of lightning into the chest vortex of a winged beast", preferredStyle: "Fantasy", preferredMood: "Epic", tags: ["combat"] },
  { title: "Anime Wing Chun Rooftop Fight", subject: "two anime martial artists on a Hong Kong rooftop", location: "neon-lit rooftop above a crowded street", action: "Jinx throws rapid punches and a butterfly kick, Knibbz blocks everything", preferredStyle: "Anime", preferredMood: "Dramatic", tags: ["urban", "combat", "night"] },
  { title: "Serene Monk Calligraphy", subject: "an ink-stained monk in black robes", location: "abandoned calligraphy hall during torrential rain", action: "he paints a sigil on the air with flowing ink that forms a dragon", preferredStyle: "Wuxia", preferredMood: "Serene", tags: ["rain", "temple"] },
  { title: "Polar Ice Shatter", subject: "a lone researcher on an arctic shelf", location: "vast Antarctic ice field at sunset", action: "the ice cracks beneath her as aurora ripples overhead", preferredStyle: "Documentary", preferredMood: "Ominous", tags: ["snow", "sunset"] },
  { title: "Surreal Library of Floating Pages", subject: "a child walking through infinite bookshelves", location: "library where gravity inverts and pages drift upward", action: "she plucks a glowing page and it dissolves into butterflies", preferredStyle: "Surreal", preferredMood: "Whimsical", tags: ["children", "portrait"] },
  { title: "Comedic Cat Heist", subject: "a sneaky cat stealing a roast chicken", location: "sunny modern kitchen, afternoon", action: "the cat climbs the counter, grabs the chicken, slides down as the owner walks in", preferredStyle: "UGC style", preferredMood: "Playful", tags: ["animals", "food", "daytime"] },
  { title: "Film Noir Detective Rain Walk", subject: "a trenchcoat detective smoking under a lamppost", location: "rain-slicked 1940s city street", action: "he pulls the brim of his hat down and walks into the fog, alone", preferredStyle: "Film noir", preferredMood: "Melancholic", tags: ["urban", "rain", "night"] },
  { title: "Drone Chase Through Mountain Pass", subject: "a motorcycle rider carving through fog", location: "mountain pass carved into cliffside, rain and fog", action: "the drone follows her bike as she overtakes three sedans and skids around a turn", preferredStyle: "Cinematic", preferredMood: "Intense", tags: ["mountains", "fog"] },
  { title: "Fantasy Market at Dawn", subject: "a hooded elf buying enchanted fruit", location: "floating riverside market with lanterns at sunrise", action: "steam rises from hot buns as merchants shout in an ancient tongue", preferredStyle: "Fantasy", preferredMood: "Hopeful", tags: ["sunrise", "crowd"] },
  { title: "Kids' Dandelion Field", subject: "two children running through tall grass", location: "summer meadow full of dandelions at golden hour", action: "they blow seeds that drift into the sun, laughing", preferredStyle: "Cinematic", preferredMood: "Euphoric", tags: ["flowers", "children", "sunset"] },
  { title: "Sci-Fi Docking Sequence", subject: "a pilot guiding her ship into a ring station", location: "orbit of a gas giant with swirling clouds", action: "the pilot eases throttle as the station's arms lock onto her hull", preferredStyle: "Sci-fi", preferredMood: "Tense", tags: ["space"] },
  { title: "Street Dance Battle", subject: "two dancers battling in a subway tunnel", location: "New York subway station lit by flickering fluorescents", action: "the first performs a backflip, the second answers with a spinning freeze", preferredStyle: "UGC style", preferredMood: "Euphoric", tags: ["urban", "dance"] },
];

const ASPECTS = ["16:9", "9:16"];
const DURATIONS = [8, 10, 12, 15];
const RESOLUTIONS = ["1080p", "4K"];

// Cinematic detail pools - same surface language the corpus uses
const LIGHTING = [
  "warm golden hour backlight", "cool blue-hour twilight", "hard top-down noon sun",
  "volumetric god rays through dust", "neon magenta rim light", "candlelit chiaroscuro",
  "teal-orange color grade", "desaturated cool palette with deep shadows",
];
const CAMERA_MOVES = [
  "extremely slow push-in", "handheld tracking shot with subtle shake",
  "360° orbit around the subject", "high crane descending into medium shot",
  "rack focus from foreground to subject", "whip-pan cutting to extreme close-up",
];
const SOUND = [
  "low-frequency pulse synced to heartbeat", "distant thunder and rain on metal",
  "ASMR sound of fabric and footfalls", "soft piano fading into ambient hum",
  "wind through bamboo with sharp sword clashes", "arcade neon hum and rain on puddles",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

// Rich phrase pools — modelled after the Instagram/Gemini-generated prompts
const CHARACTER_DETAILS = [
  "extremely natural subtle movements, breathing, and eye tension, characters maintain consistent faces, clothing, and hairstyles throughout without deformation, drift, or artifacts",
  "movie-level realistic facial features, detailed skin pores, precise lip-sync and micro-expressions, no deformation, stable identity throughout",
  "hyper-realistic skin and fabric textures, every fold and pore visible, consistent wardrobe and hair across all frames",
];
const VFX_DETAILS = [
  "realistic particle dynamics (dust motes, sparks, or ember embers drift naturally through light), depth haze, precise motion blur on fast objects while slow objects stay sharp",
  "volumetric light rays through atmospheric haze, lens flare on direct light sources, chromatic aberration at frame edges on peaks",
  "impact shockwaves, fluid spray with realistic surface tension, debris with accurate physics and falling leaves/paper",
];
const COLOR_GRADES = [
  "teal-orange cinematic color grade with crushed blacks",
  "desaturated blue-gray palette with selective warm skin tones",
  "vibrant high-contrast palette with rich saturation on primary colors only",
  "warm golden-hour film-stock emulation with natural grain",
  "cool monochrome with single accent color preserved",
];
const LENSES = [
  "shot on anamorphic 35mm, f/2.8 for shallow depth of field",
  "vintage 50mm prime lens, wide aperture for creamy bokeh",
  "cinema zoom at 85mm compression, shallow focus, heavy bokeh",
  "wide-angle 24mm for immersive feel, deep depth of field",
];

function buildTimecodedPrompt(seed: ReturnType<typeof SUBJECT_SEEDS.at>, idx: number, signatures: string[], cooccurPair?: [string, string]): string {
  if (!seed) return "";
  const duration = pick(DURATIONS, idx);
  const aspect = pick(ASPECTS, idx);
  const resolution = pick(RESOLUTIONS, idx + 1);
  const beat1End = Math.round(duration * 0.35);
  const beat2End = Math.round(duration * 0.7);
  const lighting = pick(LIGHTING, idx);
  const camera = pick(CAMERA_MOVES, idx + 2);
  const sound = pick(SOUND, idx + 3);
  const character = pick(CHARACTER_DETAILS, idx);
  const vfx = pick(VFX_DETAILS, idx + 1);
  const grade = pick(COLOR_GRADES, idx + 2);
  const lens = pick(LENSES, idx);

  const signatureLine = signatures.length > 0
    ? signatures.slice(0, 4).join(", ")
    : "cinematic composition, shallow depth of field, film grain, rich color grade";

  const cooccurLine = cooccurPair
    ? `${cooccurPair[0]} paired with ${cooccurPair[1]} for high visual impact`
    : "motion blur combined with anamorphic lens flares";

  const [a1, a2, a3] = seed.action.split(/[,.]/).map((s) => s.trim()).filter(Boolean);

  const b1 = `[00:00-00:0${Math.min(beat1End, 9)}]`;
  const b2 = `[00:0${Math.min(beat1End, 9)}-00:${beat2End.toString().padStart(2, "0")}]`;
  const b3 = `[00:${beat2End.toString().padStart(2, "0")}-00:${duration.toString().padStart(2, "0")}]`;

  return [
    `[Style] ${seed.preferredStyle || "Cinematic"} blockbuster quality, ${resolution} ultra-detailed, ${seed.preferredMood || "Dramatic"} emotional tone. Visual signature: ${signatureLine}. ${grade}. ${lens}.`,
    ``,
    `[Scene] ${seed.location}. ${lighting}. Atmospheric depth with multiple layers — foreground, midground, and background all carry detail. Real physical lighting with accurate shadows and realistic falloff.`,
    ``,
    `[Character] ${seed.subject}. ${character}. Breathing rhythm synchronized with emotional beats, subtle head tilts and eye movements between dialogue lines, natural shoulder rise and fall.`,
    ``,
    `[Camera] Primary movement: ${camera}. Secondary technique: ${cooccurLine}. Stable yet alive camera — reads as a seasoned DP operating, not mechanical.`,
    ``,
    `[Shots]`,
    `${b1} Establishing: ${a1 || seed.action.slice(0, 80)}. Ground the viewer in the space, reveal the subject from a surprising angle.`,
    `${b2} Build: ${a2 || "the central action intensifies with layered details — dust, breath, clothing movement, light shifts"}. Mid-scene the tension tightens — either the camera pushes closer or the subject shifts register.`,
    `${b3} Payoff: ${a3 || "the climactic beat lands"}. Drop into ultra-slow-motion (0.25× speed) for 0.8 seconds on the key impact, then snap back to real time on the settle.`,
    ``,
    `[Effects] ${vfx}.`,
    ``,
    `[Audio] ${sound}. Layered sound design — foreground action SFX (crisp, detailed), mid-layer ambience (room tone, environmental), background music kept sub-audible until the payoff beat where it swells. No distracting narration.`,
    ``,
    `[Technical] ${aspect} aspect ratio, ${duration} seconds total, 24fps for cinematic feel. No text, no watermarks, no subtitles. Character identity consistent throughout all three beats — same face, wardrobe, hair, and lighting logic.`,
  ].join("\n");
}

export async function generateCorpusPrompts(count = 20): Promise<Array<{ id: string; title: string; prompt: string }>> {
  // Pull insights once
  const insights = await computeCorpusInsights();
  const cooccurs = insights.cooccurrencePairs;
  const styleProfileMap = new Map(insights.styleProfiles.map((p) => [p.style, p]));

  const seeds = SUBJECT_SEEDS.slice(0, count);
  const created: Array<{ id: string; title: string; prompt: string }> = [];

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const styleProfile = seed.preferredStyle ? styleProfileMap.get(seed.preferredStyle) : null;
    const signatures = styleProfile?.signaturePhrases
      || styleProfile?.topTechniques.slice(0, 3).map((t) => t.name)
      || [];

    // Rotate through top co-occurrence pairs to spread technique variety
    const pair = cooccurs.length > 0
      ? ([cooccurs[i % cooccurs.length].a, cooccurs[i % cooccurs.length].b] as [string, string])
      : undefined;

    const promptText = buildTimecodedPrompt(seed, i, signatures, pair);
    const externalId = `corpus-gen-${Date.now()}-${i}`;

    try {
      const rec = await prisma.learnSource.create({
        data: {
          type: "cedance",
          prompt: promptText,
          title: seed.title,
          url: null,
          blobUrl: null,
          thumbnail: null,
          externalId,
          status: "complete",
          addedBy: "corpus-generator",
        },
      });
      created.push({ id: rec.id, title: rec.title || seed.title, prompt: promptText });
    } catch {
      // skip on duplicate or error
    }
  }

  return created;
}
