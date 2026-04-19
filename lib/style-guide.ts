import { prisma } from "./prisma";

// Project-level style guide enforcement.
// Reads Project.styleGuide (JSON) — already an existing column — and checks
// a prompt text against declared constraints. Zero-cost; pure string matching.
//
// styleGuide shape (all fields optional — missing = no enforcement):
//   {
//     photorealOnly: boolean,
//     forbidViolence: boolean,
//     forbidNudity: boolean,
//     forbidBrands: boolean,
//     forbidChildren: boolean,
//     requireLanguage: "he" | "en",     // for dialog lines
//     maxDurationSec: number,            // soft cap passed to caller
//     aspectRatios: ["16:9", "9:16"],    // allowed list
//     customForbiddenWords: string[],    // additional keyword blocks
//     customRequiredWords: string[],     // at least one must appear (OR logic)
//   }
//
// Returns { ok, violations, warnings } — caller decides whether to block.

export type StyleGuide = {
  photorealOnly?: boolean;
  forbidViolence?: boolean;
  forbidNudity?: boolean;
  forbidBrands?: boolean;
  forbidChildren?: boolean;
  requireLanguage?: "he" | "en";
  maxDurationSec?: number;
  aspectRatios?: string[];
  customForbiddenWords?: string[];
  customRequiredWords?: string[];
};

export type StyleCheckResult = {
  ok: boolean;
  violations: string[]; // hard-fail reasons
  warnings: string[]; // soft-fail advisories
};

const VIOLENCE_TOKENS = /\b(gun|weapon|knife|blood|gore|murder|kill|shoot|stab|torture|decapitat|massacre)/i;
const NUDITY_TOKENS = /\b(nude|naked|topless|explicit|sexual|erotic|fetish)/i;
const BRAND_TOKENS = /\b(coca[- ]cola|pepsi|apple|google|microsoft|nike|adidas|starbucks|mcdonalds|tesla|ferrari|louis vuitton|chanel)\b/i;
const CHILDREN_TOKENS = /\b(child|children|kid|kids|toddler|baby|infant|minor|underage|teen)\b/i;
const ANIMATION_TOKENS = /\b(cartoon|anime|animated|pixar|disney[- ]style|2d animation|cel[- ]shaded|stylized)\b/i;

export function checkStyleGuide(prompt: string, guide: StyleGuide | null | undefined, opts?: { durationSec?: number; aspectRatio?: string }): StyleCheckResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  if (!guide) return { ok: true, violations, warnings };

  if (guide.photorealOnly && ANIMATION_TOKENS.test(prompt)) {
    violations.push("project requires photoreal; prompt contains animation/cartoon/anime tokens");
  }
  if (guide.forbidViolence && VIOLENCE_TOKENS.test(prompt)) {
    violations.push("project forbids explicit violence; prompt contains weapon/gore tokens");
  }
  if (guide.forbidNudity && NUDITY_TOKENS.test(prompt)) {
    violations.push("project forbids explicit nudity; prompt contains sexual tokens");
  }
  if (guide.forbidBrands && BRAND_TOKENS.test(prompt)) {
    const brand = prompt.match(BRAND_TOKENS)?.[0];
    violations.push(`project forbids brand names (found: "${brand}")`);
  }
  if (guide.forbidChildren && CHILDREN_TOKENS.test(prompt)) {
    violations.push("project forbids scenes involving minors");
  }
  if (guide.customForbiddenWords?.length) {
    for (const w of guide.customForbiddenWords) {
      if (!w.trim()) continue;
      const rx = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (rx.test(prompt)) violations.push(`project-specific forbidden word: "${w}"`);
    }
  }
  if (guide.customRequiredWords?.length) {
    const hit = guide.customRequiredWords.some((w) => {
      if (!w.trim()) return false;
      return new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(prompt);
    });
    if (!hit) warnings.push(`project requires at least one of: ${guide.customRequiredWords.join(", ")}`);
  }
  if (guide.maxDurationSec && opts?.durationSec && opts.durationSec > guide.maxDurationSec) {
    violations.push(`requested ${opts.durationSec}s exceeds project maxDurationSec=${guide.maxDurationSec}`);
  }
  if (guide.aspectRatios?.length && opts?.aspectRatio && !guide.aspectRatios.includes(opts.aspectRatio)) {
    violations.push(`aspectRatio ${opts.aspectRatio} not in project whitelist [${guide.aspectRatios.join(", ")}]`);
  }
  return { ok: violations.length === 0, violations, warnings };
}

// Convenience lookup — given a sceneId, resolves the project + its style guide.
// Caches nothing; kept small so callers can await inline.
export async function loadStyleGuideForScene(sceneId: string): Promise<StyleGuide | null> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { episode: { select: { season: { select: { series: { select: { project: { select: { styleGuide: true } } } } } } } } },
  });
  const raw = scene?.episode?.season?.series?.project?.styleGuide;
  if (!raw) return null;
  return raw as StyleGuide;
}
