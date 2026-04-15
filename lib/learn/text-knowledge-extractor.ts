// Pattern-based knowledge extractor for AI video prompts.
// No external LLM needed — runs instantly over the full corpus.
//
// Uses curated pattern libraries built from studying the Seedance / Sora prompt style.
// Each category has (regex -> canonical phrase) pairs. Hits become KnowledgeNodes.

import { prisma } from "./db";

// ------------------------------------------------------------------
// Pattern libraries (case-insensitive word-boundary matching)
// ------------------------------------------------------------------

// Techniques: specific cinematographic/filming moves the prompt asks for.
const TECHNIQUE_PATTERNS: Array<[RegExp, string]> = [
  // Camera movement
  [/\bdolly (?:in|out|push|zoom)\b/i, "Dolly push/pull"],
  [/\bpush[-\s]in\b/i, "Slow push-in"],
  [/\bpull[-\s]out\b/i, "Pull-out reveal"],
  [/\btracking shot\b/i, "Tracking shot"],
  [/\bhandheld\b/i, "Handheld camera"],
  [/\b(?:360|three-sixty)[\s-]?(?:degree )?(?:orbit|rotation|pan)/i, "360° orbit"],
  [/\bcrane shot\b/i, "Crane shot"],
  [/\baerial (?:shot|view|drone)\b/i, "Aerial drone shot"],
  [/\bdrone (?:shot|view|footage)\b/i, "Drone shot"],
  [/\bwhip[\s-]?pan\b/i, "Whip pan"],
  [/\btilt[\s-]?(?:up|down|shift)\b/i, "Tilt move"],
  [/\bpan\s+(?:across|left|right|from)\b/i, "Pan across"],
  [/\bsteadicam\b/i, "Steadicam"],
  [/\bPOV (?:shot|view)?\b/i, "POV shot"],
  [/\bfirst[\s-]person (?:view|shot)\b/i, "First-person POV"],
  [/\bover[\s-]the[\s-]shoulder\b|\bOTS\b/i, "Over-the-shoulder"],
  [/\bjet cut\b|\bhard cut\b/i, "Hard/jet cut"],
  [/\bjump cut\b/i, "Jump cut"],
  [/\bmatch cut\b/i, "Match cut"],
  [/\bcross[\s-]?cut(?:ting)?\b/i, "Cross-cutting"],
  // Shot size
  [/\bextreme close[\s-]?up\b|\bECU\b/i, "Extreme close-up"],
  [/\bclose[\s-]?up\b|\bCU\b/i, "Close-up shot"],
  [/\bmedium (?:shot|close[\s-]?up)\b/i, "Medium shot"],
  [/\bwide (?:shot|angle)\b/i, "Wide shot"],
  [/\bestablishing shot\b/i, "Establishing shot"],
  [/\bextreme wide\b/i, "Extreme wide shot"],
  [/\btwo[\s-]shot\b/i, "Two-shot"],
  [/\binsert shot\b/i, "Insert shot"],
  [/\bmacro (?:shot|lens|close-?up)\b/i, "Macro shot"],
  // Angle
  [/\blow[\s-]angle\b/i, "Low-angle shot"],
  [/\bhigh[\s-]angle\b/i, "High-angle shot"],
  [/\bbird['’]?s[\s-]?eye\b/i, "Bird's-eye view"],
  [/\btop[\s-]?down\b|\boverhead shot\b/i, "Overhead shot"],
  [/\bdutch (?:angle|tilt)\b/i, "Dutch angle"],
  [/\bcanted (?:angle|frame)\b/i, "Canted angle"],
  [/\beye[\s-]level\b/i, "Eye-level shot"],
  // Lens / DoF
  [/\banamorphic\b/i, "Anamorphic lens"],
  [/\bshallow (?:depth of field|focus|dof)\b/i, "Shallow depth of field"],
  [/\bdeep (?:depth of field|focus)\b/i, "Deep depth of field"],
  [/\brack focus\b|\bfocus pull\b/i, "Rack focus"],
  [/\bbokeh\b/i, "Bokeh background"],
  [/\bwide[\s-]?angle lens\b/i, "Wide-angle lens"],
  [/\btelephoto\b/i, "Telephoto lens"],
  [/\bfisheye\b/i, "Fisheye lens"],
  [/\b(?:35|50|70|85)mm\b/i, "Cinematic lens (35/50/70/85mm)"],
  // Lighting
  [/\bgolden hour\b/i, "Golden hour lighting"],
  [/\bblue hour\b/i, "Blue hour lighting"],
  [/\bbacklight(?:ing|ed)?\b/i, "Backlighting"],
  [/\bsilhouette\b/i, "Silhouette"],
  [/\bchiaroscuro\b/i, "Chiaroscuro lighting"],
  [/\brim light(?:ing)?\b/i, "Rim lighting"],
  [/\bvolumetric (?:light|fog|haze)\b/i, "Volumetric lighting"],
  [/\bgod rays?\b/i, "God rays"],
  [/\bneon (?:light|glow|sign)/i, "Neon lighting"],
  [/\bcandle(?:light|lit)\b/i, "Candlelight"],
  [/\bhard light\b|\bharsh light\b/i, "Hard lighting"],
  [/\bsoft light(?:ing)?\b/i, "Soft lighting"],
  [/\bhigh[\s-]?key\b/i, "High-key lighting"],
  [/\blow[\s-]?key\b/i, "Low-key lighting"],
  [/\bnatural light\b/i, "Natural lighting"],
  // Color / grade
  [/\bteal[\s-]?(?:and[\s-])?orange\b/i, "Teal-orange color grade"],
  [/\bmonochrom(?:e|atic)\b|\bblack[\s-]?and[\s-]?white\b/i, "Monochrome"],
  [/\bdesaturated\b/i, "Desaturated palette"],
  [/\bvibrant (?:colors?|palette)\b/i, "Vibrant palette"],
  [/\bpastel (?:colors?|palette|tones?)\b/i, "Pastel palette"],
  [/\bwarm (?:tones?|palette|color)/i, "Warm palette"],
  [/\bcool (?:tones?|palette|color)/i, "Cool palette"],
  [/\bfilm grain\b/i, "Film grain"],
  [/\bvintage (?:look|film|color)/i, "Vintage film look"],
  [/\b(?:4k|4K|8k|8K|1080p|720p)\b/, "High-resolution spec"],
  // Motion & speed
  [/\b(?:ultra[\s-]?)?slow[\s-]?motion\b/i, "Slow motion"],
  [/\btime[\s-]?lapse\b/i, "Time-lapse"],
  [/\bhyper[\s-]?lapse\b/i, "Hyper-lapse"],
  [/\bfreeze[\s-]?frame\b/i, "Freeze frame"],
  [/\bbullet[\s-]?time\b/i, "Bullet time"],
  [/\bmotion blur\b/i, "Motion blur"],
  [/\bspeed ramp(?:ing)?\b/i, "Speed ramp"],
  // VFX / atmosphere
  [/\bparticle(?:s| effects?)/i, "Particle effects"],
  [/\bshockwaves?\b/i, "Shockwave effect"],
  [/\blens flare\b/i, "Lens flare"],
  [/\bchromatic aberration\b/i, "Chromatic aberration"],
  [/\bdepth haze\b|\batmospheric haze\b/i, "Atmospheric haze"],
  [/\bdust (?:motes|particles)\b/i, "Dust motes in light"],
  [/\bsparks?\b/i, "Spark effects"],
  [/\bembers?\b/i, "Floating embers"],
  [/\bfog\b|\bmist\b/i, "Fog/mist atmosphere"],
  [/\brain\b/i, "Rain"],
  [/\bsnow\b/i, "Snow"],
  [/\bbioluminescent?\b/i, "Bioluminescence"],
  // Sound
  [/\bASMR\b/i, "ASMR sound design"],
  [/\bambient sound\b/i, "Ambient sound"],
  [/\bdiegetic sound\b/i, "Diegetic sound"],
  [/\bfoley\b/i, "Foley effects"],
];

// Style labels
const STYLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bcinematic\b/i, "Cinematic"],
  [/\bhollywood\b/i, "Hollywood"],
  [/\banime\b|\b2D animation\b/i, "Anime"],
  [/\b3D animation\b|\bCGI\b/i, "3D animation"],
  [/\bdocumentary\b/i, "Documentary"],
  [/\bphotorealistic\b|\bhyper[\s-]?realistic\b/i, "Photorealistic"],
  [/\bwuxia\b/i, "Wuxia"],
  [/\bcyberpunk\b/i, "Cyberpunk"],
  [/\bsteampunk\b/i, "Steampunk"],
  [/\bsurreal(?:ism|ist)?\b/i, "Surreal"],
  [/\bpost[\s-]apocalyptic\b/i, "Post-apocalyptic"],
  [/\bfantasy\b/i, "Fantasy"],
  [/\bsci[\s-]?fi\b|\bscience fiction\b/i, "Sci-fi"],
  [/\bnoir\b|\bfilm noir\b/i, "Film noir"],
  [/\bminimalist?\b/i, "Minimalist"],
  [/\bretro\b|\bvintage\b|\b80s\b|\b90s\b/i, "Retro/vintage"],
  [/\bUGC\b|\buser[\s-]generated\b|\bselfie style\b/i, "UGC style"],
  [/\bcommercial(?:\sstyle)?\b|\badvertising\b/i, "Commercial"],
  [/\beditorial\b|\bfashion editorial\b/i, "Editorial fashion"],
  [/\bJapanese\b.*\b(?:romance|drama)/i, "Japanese drama"],
  [/\bChinese\b.*\b(?:drama|palace)/i, "Chinese palace drama"],
  [/\bhorror\b/i, "Horror"],
  [/\bthriller\b/i, "Thriller"],
  [/\bromance\b|\bromantic\b/i, "Romantic"],
];

// Mood labels
const MOOD_PATTERNS: Array<[RegExp, string]> = [
  [/\btense\b|\btension\b|\bsuspense(?:ful)?\b/i, "Tense"],
  [/\bdramatic\b/i, "Dramatic"],
  [/\bserene\b|\btranquil\b|\bpeaceful\b/i, "Serene"],
  [/\beuphoric\b|\bjoyful\b|\bupl?ifting\b/i, "Euphoric"],
  [/\bmelanchol(?:ic|y)\b|\bsolemn\b|\bsad\b/i, "Melancholic"],
  [/\bominous\b|\bforeboding\b|\beerie\b/i, "Ominous"],
  [/\bnostalgic\b|\bwistful\b/i, "Nostalgic"],
  [/\bhopeful\b|\binspiring\b/i, "Hopeful"],
  [/\bplayful\b|\bwhimsical\b|\bcomedic\b/i, "Playful"],
  [/\bintimate\b|\bsensual\b/i, "Intimate"],
  [/\bepic\b|\bgrand\b|\bmajestic\b/i, "Epic"],
  [/\bgritty\b|\bvisceral\b/i, "Gritty"],
  [/\betherea?l\b|\bdreamy\b|\bdreamlike\b/i, "Ethereal"],
  [/\bominous\b|\bdark\b|\bsinister\b/i, "Dark"],
];

// Tag keywords
const TAG_PATTERNS: Array<[RegExp, string]> = [
  [/\bmountain\b/i, "mountains"],
  [/\bforest\b/i, "forest"],
  [/\bocean\b|\bsea\b|\bwaves?\b/i, "ocean"],
  [/\bcity\b|\burban\b/i, "urban"],
  [/\bdesert\b/i, "desert"],
  [/\bcastle\b/i, "castle"],
  [/\btemple\b/i, "temple"],
  [/\bstreet\b/i, "street"],
  [/\brain\b/i, "rain"],
  [/\bsnow\b/i, "snow"],
  [/\bfog\b|\bmist\b/i, "fog"],
  [/\bnight\b/i, "night"],
  [/\bday\b|\bmorning\b/i, "daytime"],
  [/\bsunset\b|\btwilight\b|\bdusk\b/i, "sunset"],
  [/\bsunrise\b|\bdawn\b/i, "sunrise"],
  [/\bmasked\b|\bwarrior\b|\bronin\b|\bsamurai\b|\bsword\b/i, "combat"],
  [/\bdance\b|\bdancer\b|\bdancing\b/i, "dance"],
  [/\bfood\b|\bcook(?:ing)?\b|\bkitchen\b/i, "food"],
  [/\bchild\b|\bkids?\b/i, "children"],
  [/\banimal\b|\bdog\b|\bcat\b|\bhorse\b|\bbird\b/i, "animals"],
  [/\bflowers?\b|\bpetals?\b/i, "flowers"],
  [/\bfire\b|\bflames?\b/i, "fire"],
  [/\bwater\b|\bsplash\b/i, "water"],
  [/\bspace\b|\bgalax\w+\b|\bplanet\b|\bstar\b/i, "space"],
  [/\bportrait\b|\bface\b/i, "portrait"],
  [/\bcrowd\b|\bpeople\b/i, "crowd"],
];

// ------------------------------------------------------------------
// Extraction core
// ------------------------------------------------------------------

export type ExtractedAnalysis = {
  description: string;
  techniques: string[];
  style: string | null;
  mood: string | null;
  difficulty: string;
  howTo: string[];
  tags: string[];
  insights: string[];
};

function matchAll(text: string, patterns: Array<[RegExp, string]>): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const [re, label] of patterns) {
    if (re.test(text) && !seen.has(label)) {
      hits.push(label);
      seen.add(label);
    }
  }
  return hits;
}

function bestOne(text: string, patterns: Array<[RegExp, string]>): string | null {
  for (const [re, label] of patterns) {
    if (re.test(text)) return label;
  }
  return null;
}

function detectDifficulty(text: string, techniqueCount: number): string {
  const timeBeats = (text.match(/\[?\d{1,2}[:.]\d{2}(?:-\d{1,2}[:.]\d{2})?\]?/g) || []).length;
  const wordCount = text.split(/\s+/).length;
  const score = techniqueCount + timeBeats * 2 + (wordCount > 300 ? 2 : 0);
  if (score >= 10) return "advanced";
  if (score >= 5) return "intermediate";
  return "beginner";
}

function deriveHowTo(text: string, techniques: string[]): string[] {
  const steps: string[] = [];

  // Timecoded beats become sequential steps
  const beatRegex = /\[?(\d{1,2}[:.]\d{2}(?:-\d{1,2}[:.]\d{2})?)\]?[:\s]+([^[\n]{20,200})/g;
  let m: RegExpExecArray | null;
  while ((m = beatRegex.exec(text)) !== null && steps.length < 6) {
    const beat = m[1];
    const action = m[2].trim().replace(/\s+/g, " ");
    steps.push(`${beat} — ${action}`);
  }

  // Fall back to technique-derived steps
  if (steps.length < 2 && techniques.length > 0) {
    const top = techniques.slice(0, 4);
    for (const t of top) {
      steps.push(`Apply ${t.toLowerCase()} to match the reference style.`);
    }
  }
  return steps;
}

function deriveInsights(text: string, techniques: string[], style: string | null): string[] {
  const insights: string[] = [];
  const wordCount = text.split(/\s+/).length;
  const hasSound = /\b(sound|audio|foley|asmr|music|bgm|score|heartbeat|breathing|whisper)\b/i.test(text);
  const hasTiming = /\[?\d{1,2}[:.]\d{2}/.test(text);
  const hasSpec = /\b(?:4k|8k|1080p|720p|16:9|9:16|\d+fps)\b/i.test(text);
  const hasCharacter = /\b(character|face|expression|eyes|identity|wardrobe)\b/i.test(text);

  if (wordCount > 200 && techniques.length >= 5) {
    insights.push("דוגמה לפרומפט מפורט — עשיר בשפה קולנועית וטכניקות ספציפיות.");
  }
  if (hasTiming) {
    insights.push("שימוש ב-timecodes מחלק את הסרטון לביטים ברורים — טכניקה חיונית לסצנות של 10-15 שניות.");
  }
  if (hasSound) {
    insights.push("העושר של תיאור הסאונד (אמביינט, נשימות, מוסיקה) מוסיף עומק רגשי לתוצאה.");
  }
  if (hasSpec) {
    insights.push("ציון רזולוציה/יחס/FPS בתוך הפרומפט מכוון את המודל לסטנדרט טכני ספציפי.");
  }
  if (hasCharacter) {
    insights.push("תיאור מפורט של דמות (פנים, הבעה, תלבושת) חיוני לעקביות על פני פריימים.");
  }
  if (style === "Cinematic" && techniques.some((t) => /lens|lighting/i.test(t))) {
    insights.push("שילוב של lens specifics + lighting הוא חתימה של פרומפט קולנועי מקצועי.");
  }
  if (insights.length === 0) {
    insights.push("פרומפט קצר ותמציתי — טוב לאימות מהיר של רעיון, אבל הוסף פרטים קולנועיים לתוצאה איכותית יותר.");
  }
  return insights.slice(0, 5);
}

function deriveDescription(text: string, style: string | null, mood: string | null): string {
  const firstSentence = text.split(/[.!?]/)[0].trim();
  const opener = firstSentence.length > 30 && firstSentence.length < 300
    ? firstSentence
    : text.slice(0, 200).replace(/\s+/g, " ").trim();
  const tail = [style, mood].filter(Boolean).join(", ");
  return tail ? `${opener} (${tail.toLowerCase()})` : opener;
}

export function extractFromText(prompt: string): ExtractedAnalysis {
  const text = prompt.slice(0, 8000);
  const techniques = matchAll(text, TECHNIQUE_PATTERNS);
  const style = bestOne(text, STYLE_PATTERNS);
  const mood = bestOne(text, MOOD_PATTERNS);
  const tags = matchAll(text, TAG_PATTERNS);
  const difficulty = detectDifficulty(text, techniques.length);
  const howTo = deriveHowTo(text, techniques);
  const insights = deriveInsights(text, techniques, style);
  const description = deriveDescription(text, style, mood);

  return {
    description,
    techniques: techniques.slice(0, 10),
    style,
    mood,
    difficulty,
    howTo: howTo.slice(0, 6),
    tags: tags.slice(0, 8),
    insights,
  };
}

function analysisToNodes(a: ExtractedAnalysis, analysisId: string) {
  const nodes: Array<{ type: string; title: string; body: string; tags: string[]; confidence: number; analysisId: string }> = [];
  for (const t of a.techniques) {
    nodes.push({ type: "technique", title: t, body: t, tags: [...a.tags, a.style || ""].filter(Boolean), confidence: 0.7, analysisId });
  }
  if (a.style) {
    nodes.push({ type: "style", title: `Style: ${a.style}`, body: a.description, tags: [a.style, a.mood || "", ...a.tags].filter(Boolean), confidence: 0.8, analysisId });
  }
  for (const s of a.howTo) {
    nodes.push({ type: "how_to", title: s.slice(0, 120), body: s, tags: a.tags, confidence: 0.65, analysisId });
  }
  for (const i of a.insights) {
    nodes.push({ type: "insight", title: i.slice(0, 120), body: i, tags: a.tags, confidence: 0.7, analysisId });
  }
  return nodes;
}

export async function extractAllDeterministic(
  jobId?: string,
): Promise<{ processed: number; createdAnalyses: number; totalNodes: number; updated: number }> {
  const { updateJob } = await import("./sync-jobs");

  if (jobId) await updateJob(jobId, { currentStep: "טוען פרומפטים מה-DB…" });

  const sources = await prisma.learnSource.findMany({
    where: { type: "cedance", status: "complete" },
    include: { analysis: true },
  });

  if (jobId) await updateJob(jobId, {
    totalItems: sources.length,
    currentStep: "מריץ ניתוח דפוסים",
    currentMessage: `0 / ${sources.length}`,
  });

  let createdAnalyses = 0;
  let updated = 0;
  let totalNodes = 0;
  let i = 0;

  for (const source of sources) {
    i++;
    if (jobId && (i % 5 === 0 || i === sources.length)) {
      await updateJob(jobId, {
        completedItems: i,
        currentMessage: `${i} / ${sources.length} · נוצרו ${createdAnalyses} · שודרגו ${updated}`,
      });
    }
    const a = extractFromText(source.prompt);
    try {
      if (source.analysis) {
        // Update existing analysis if it looks thin (e.g. empty techniques)
        const currentTech = source.analysis.techniques.length;
        if (currentTech < a.techniques.length) {
          await prisma.videoAnalysis.update({
            where: { id: source.analysis.id },
            data: {
              description: a.description,
              techniques: a.techniques,
              howTo: a.howTo,
              tags: a.tags,
              style: a.style,
              mood: a.mood,
              difficulty: a.difficulty,
              insights: a.insights,
              rawGemini: JSON.stringify({ source: "pattern-extractor", ...a }),
            },
          });
          // Replace nodes
          await prisma.knowledgeNode.deleteMany({ where: { analysisId: source.analysis.id } });
          const nodes = analysisToNodes(a, source.analysis.id);
          if (nodes.length > 0) {
            await prisma.knowledgeNode.createMany({ data: nodes });
          }
          totalNodes += nodes.length;
          updated++;
        }
      } else {
        const saved = await prisma.videoAnalysis.create({
          data: {
            sourceId: source.id,
            description: a.description,
            techniques: a.techniques,
            howTo: a.howTo,
            tags: a.tags,
            style: a.style,
            mood: a.mood,
            difficulty: a.difficulty,
            insights: a.insights,
            promptAlignment: null,
            rawGemini: JSON.stringify({ source: "pattern-extractor", ...a }),
          },
        });
        const nodes = analysisToNodes(a, saved.id);
        if (nodes.length > 0) await prisma.knowledgeNode.createMany({ data: nodes });
        totalNodes += nodes.length;
        createdAnalyses++;
      }
    } catch {
      // skip individual failures
    }
  }

  return { processed: sources.length, createdAnalyses, totalNodes, updated };
}
