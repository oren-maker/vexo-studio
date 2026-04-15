// Corpus-level analytics — aggregate across all analyzed prompts to produce
// actionable learning insights. This is what "learning" actually means:
// not tagging individual prompts but discovering patterns across the corpus.

import { prisma } from "./db";

export type CooccurrencePair = {
  a: string;
  b: string;
  count: number;
  lift: number; // P(A and B) / (P(A) * P(B)). >1 = positively correlated.
};

export type StyleProfile = {
  style: string;
  count: number;
  avgTechniquesPerPrompt: number;
  topTechniques: Array<{ name: string; freqPct: number }>;
  topMoods: Array<{ name: string; freqPct: number }>;
  topTags: Array<{ name: string; freqPct: number }>;
  difficultyMix: Record<string, number>;
  signaturePhrases: string[]; // techniques that appear disproportionately in this style
};

export type GapOpportunity = {
  dimension: "style" | "mood" | "tag";
  value: string;
  currentCount: number;
  medianCount: number;
  suggestion: string;
};

export type TopPerformer = {
  sourceId: string;
  title: string | null;
  techniqueCount: number;
  tagCount: number;
  hasTimecodes: boolean;
  wordCount: number;
  richnessScore: number; // weighted combo
};

export type UpgradeInsights = {
  totalUpgrades: number;
  byTrigger: Record<string, number>;        // auto-improve | regenerate-from-url | retry-analysis | manual
  avgWordDelta: number;                     // average +/- words per upgrade
  avgWordPctDelta: number;                  // average % growth
  avgLinesAdded: number;
  avgLinesRemoved: number;
  topAddedPhrases: Array<{ phrase: string; addedIn: number }>;   // 2-3 word phrases that appear in NEW versions but not OLD
  topRemovedPhrases: Array<{ phrase: string; removedIn: number }>;
  sectionGrowth: Array<{ section: string; addedPct: number }>;   // % of upgrades that ADDED this section
  patterns: string[];                       // human-readable Hebrew rules ("השדרוגים נוספו 'volumetric lighting' ב-X% מהמקרים")
};

export type CorpusInsights = {
  totals: {
    sources: number;
    analyses: number;
    knowledgeNodes: number;
    avgTechniquesPerPrompt: number;
    avgWordsPerPrompt: number;
    promptsWithTimecodes: number;
  };
  topTechniques: Array<{ name: string; count: number; pct: number }>;
  topStyles: Array<{ name: string; count: number; pct: number }>;
  topMoods: Array<{ name: string; count: number; pct: number }>;
  topTags: Array<{ name: string; count: number; pct: number }>;
  difficultyDistribution: Record<string, number>;
  cooccurrencePairs: CooccurrencePair[];
  styleProfiles: StyleProfile[];
  gaps: GapOpportunity[];
  topPerformers: TopPerformer[];
  derivedRules: string[]; // actionable rules derived from the data
  upgrades?: UpgradeInsights; // cross-version learning from PromptVersion diffs
  strategicInsights?: string[]; // Gemini 2.5 Pro strategic recommendations
};

// ---- helpers ----

function countBy<T>(items: T[], key: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function sortMap(m: Map<string, number>, limit = 10) {
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function toPct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
}

// ---- main analytics ----

export async function computeCorpusInsights(): Promise<CorpusInsights> {
  const analyses = await prisma.videoAnalysis.findMany({
    include: { source: true },
  });
  const nodeCount = await prisma.knowledgeNode.count();

  const total = analyses.length;
  if (total === 0) {
    return {
      totals: { sources: 0, analyses: 0, knowledgeNodes: 0, avgTechniquesPerPrompt: 0, avgWordsPerPrompt: 0, promptsWithTimecodes: 0 },
      topTechniques: [], topStyles: [], topMoods: [], topTags: [],
      difficultyDistribution: {}, cooccurrencePairs: [], styleProfiles: [],
      gaps: [], topPerformers: [], derivedRules: [],
    };
  }

  // ---- Global frequencies ----
  const techCount = new Map<string, number>();
  const styleCount = new Map<string, number>();
  const moodCount = new Map<string, number>();
  const tagCount = new Map<string, number>();
  const difficulty: Record<string, number> = { beginner: 0, intermediate: 0, advanced: 0 };

  let totalTechniques = 0;
  let totalWords = 0;
  let promptsWithTimecodes = 0;

  for (const a of analyses) {
    for (const t of a.techniques) techCount.set(t, (techCount.get(t) || 0) + 1);
    if (a.style) styleCount.set(a.style, (styleCount.get(a.style) || 0) + 1);
    if (a.mood) moodCount.set(a.mood, (moodCount.get(a.mood) || 0) + 1);
    for (const tag of a.tags) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    if (a.difficulty && difficulty[a.difficulty] !== undefined) difficulty[a.difficulty]++;

    totalTechniques += a.techniques.length;
    const wc = a.source.prompt.split(/\s+/).length;
    totalWords += wc;
    if (/\[?\d{1,2}[:.]\d{2}/.test(a.source.prompt)) promptsWithTimecodes++;
  }

  const topTechniques = sortMap(techCount, 15).map((x) => ({ ...x, pct: toPct(x.count, total) }));
  const topStyles = sortMap(styleCount, 10).map((x) => ({ ...x, pct: toPct(x.count, total) }));
  const topMoods = sortMap(moodCount, 10).map((x) => ({ ...x, pct: toPct(x.count, total) }));
  const topTags = sortMap(tagCount, 15).map((x) => ({ ...x, pct: toPct(x.count, total) }));

  // ---- Technique co-occurrence (pairs that appear together more than chance) ----
  const pairCount = new Map<string, number>();
  const topTechNames = topTechniques.slice(0, 20).map((x) => x.name);
  const techSet = new Set(topTechNames);

  for (const a of analyses) {
    const techs = a.techniques.filter((t) => techSet.has(t));
    for (let i = 0; i < techs.length; i++) {
      for (let j = i + 1; j < techs.length; j++) {
        const [x, y] = [techs[i], techs[j]].sort();
        const k = `${x}||${y}`;
        pairCount.set(k, (pairCount.get(k) || 0) + 1);
      }
    }
  }

  const cooccurrencePairs: CooccurrencePair[] = Array.from(pairCount.entries())
    .map(([k, count]) => {
      const [a, b] = k.split("||");
      const pA = (techCount.get(a) || 0) / total;
      const pB = (techCount.get(b) || 0) / total;
      const pAB = count / total;
      const lift = pA > 0 && pB > 0 ? pAB / (pA * pB) : 0;
      return { a, b, count, lift: Math.round(lift * 100) / 100 };
    })
    .filter((p) => p.count >= 3 && p.lift >= 1.2)
    .sort((a, b) => b.lift * b.count - a.lift * a.count)
    .slice(0, 12);

  // ---- Style profiles ----
  const styleProfiles: StyleProfile[] = [];
  for (const { name: styleName, count: styleN } of topStyles.slice(0, 6)) {
    const subset = analyses.filter((a) => a.style === styleName);
    const subTech = new Map<string, number>();
    const subMood = new Map<string, number>();
    const subTag = new Map<string, number>();
    const subDiff: Record<string, number> = { beginner: 0, intermediate: 0, advanced: 0 };
    let subTechTotal = 0;

    for (const a of subset) {
      for (const t of a.techniques) subTech.set(t, (subTech.get(t) || 0) + 1);
      if (a.mood) subMood.set(a.mood, (subMood.get(a.mood) || 0) + 1);
      for (const tag of a.tags) subTag.set(tag, (subTag.get(tag) || 0) + 1);
      if (a.difficulty && subDiff[a.difficulty] !== undefined) subDiff[a.difficulty]++;
      subTechTotal += a.techniques.length;
    }

    // Signature phrases: techniques with much higher freq here than globally
    const signature: string[] = [];
    for (const [tech, n] of Array.from(subTech.entries())) {
      const localPct = n / subset.length;
      const globalPct = (techCount.get(tech) || 0) / total;
      if (localPct >= 0.25 && localPct > globalPct * 1.8 && signature.length < 6) {
        signature.push(tech);
      }
    }

    styleProfiles.push({
      style: styleName,
      count: styleN,
      avgTechniquesPerPrompt: Math.round((subTechTotal / subset.length) * 10) / 10,
      topTechniques: sortMap(subTech, 5).map((x) => ({ name: x.name, freqPct: toPct(x.count, subset.length) })),
      topMoods: sortMap(subMood, 3).map((x) => ({ name: x.name, freqPct: toPct(x.count, subset.length) })),
      topTags: sortMap(subTag, 5).map((x) => ({ name: x.name, freqPct: toPct(x.count, subset.length) })),
      difficultyMix: subDiff,
      signaturePhrases: signature,
    });
  }

  // ---- Gap analysis: underrepresented style × mood combinations ----
  const gaps: GapOpportunity[] = [];
  const styleMedian = Math.max(1, Math.round(total / Math.max(topStyles.length, 1)));

  // Styles that are rare
  for (const s of topStyles) {
    if (s.count > 0 && s.count < styleMedian / 3) {
      gaps.push({
        dimension: "style",
        value: s.name,
        currentCount: s.count,
        medianCount: styleMedian,
        suggestion: `יש רק ${s.count} פרומפטים בסגנון "${s.name}". הוסף עוד כדי שה-AI Director יוכל להציע וריאציות בסגנון זה.`,
      });
    }
  }

  // Tags barely represented
  const tagMedian = Math.max(1, Math.round(total / Math.max(topTags.length * 2, 1)));
  const weakTags = topTags.filter((t) => t.count < tagMedian).slice(0, 3);
  for (const t of weakTags) {
    gaps.push({
      dimension: "tag",
      value: t.name,
      currentCount: t.count,
      medianCount: tagMedian,
      suggestion: `נושא "${t.name}" מיוצג חלש (${t.count} פרומפטים) — סדרה עם נושא זה תחזור עם פחות reference context.`,
    });
  }

  // ---- Top performers (richness score) ----
  const topPerformers: TopPerformer[] = analyses
    .map((a) => {
      const wc = a.source.prompt.split(/\s+/).length;
      const hasTC = /\[?\d{1,2}[:.]\d{2}/.test(a.source.prompt);
      const richnessScore =
        a.techniques.length * 2 +
        (hasTC ? 6 : 0) +
        a.tags.length +
        Math.min(wc / 100, 4);
      return {
        sourceId: a.sourceId,
        title: a.source.title,
        techniqueCount: a.techniques.length,
        tagCount: a.tags.length,
        hasTimecodes: hasTC,
        wordCount: wc,
        richnessScore: Math.round(richnessScore * 10) / 10,
      };
    })
    .sort((a, b) => b.richnessScore - a.richnessScore)
    .slice(0, 8);

  // ---- Derived rules (the actual "learning") ----
  const rules: string[] = [];
  const timecodePct = toPct(promptsWithTimecodes, total);
  const avgTech = Math.round((totalTechniques / total) * 10) / 10;
  const avgWords = Math.round(totalWords / total);

  if (timecodePct >= 30) {
    rules.push(`${timecodePct}% מהפרומפטים האיכותיים משתמשים ב-timecoded beats — זו חתימה של פרומפט לסרטון ארוך (10-15s).`);
  }
  rules.push(`ממוצע של ${avgTech} טכניקות קולנועיות לפרומפט. מתחת ל-${Math.max(1, avgTech - 2)} — הפרומפט דורש העשרה.`);
  rules.push(`אורך ממוצע: ${avgWords} מילים. פרומפטים של 100+ מילים ב-${topStyles[0]?.name || "Cinematic"} נותנים תוצאה עשירה יותר.`);

  if (cooccurrencePairs.length > 0) {
    const top = cooccurrencePairs[0];
    rules.push(`זוג טכניקות "${top.a}" + "${top.b}" מופיע יחד ב-${top.count} פרומפטים (lift ×${top.lift}) — שילוב מומלץ.`);
  }

  for (const p of styleProfiles.slice(0, 3)) {
    if (p.signaturePhrases.length > 0) {
      rules.push(`סגנון "${p.style}" מאופיין ב-: ${p.signaturePhrases.slice(0, 3).join(", ")}.`);
    }
  }

  // Correlation: do top performers share features?
  const tpAvgTech = topPerformers.reduce((s, p) => s + p.techniqueCount, 0) / Math.max(topPerformers.length, 1);
  const tpTimecodePct = toPct(topPerformers.filter((p) => p.hasTimecodes).length, topPerformers.length);
  rules.push(
    `הפרומפטים הטובים ביותר במאגר: ${Math.round(tpAvgTech)} טכניקות בממוצע (פי ${Math.max(1, Math.round(tpAvgTech / Math.max(avgTech, 1)))} מהממוצע), ${tpTimecodePct}% משתמשים ב-timecodes.`,
  );

  const result: CorpusInsights = {
    totals: {
      sources: total,
      analyses: total,
      knowledgeNodes: nodeCount,
      avgTechniquesPerPrompt: avgTech,
      avgWordsPerPrompt: avgWords,
      promptsWithTimecodes,
    },
    topTechniques,
    topStyles,
    topMoods,
    topTags,
    difficultyDistribution: difficulty,
    cooccurrencePairs,
    styleProfiles,
    gaps,
    topPerformers,
    derivedRules: rules,
    upgrades: await computeUpgradeInsights(),
  };

  // Extra: Gemini 2.5 Pro strategic insights (best-effort — never fails parent)
  try {
    const { generateStrategicInsights } = await import("./gemini-pro-insights");
    const strategic = await generateStrategicInsights({
      totals: result.totals,
      topTechniques: result.topTechniques,
      topStyles: result.topStyles,
      topMoods: result.topMoods,
      gaps: result.gaps,
      cooccurrencePairs: result.cooccurrencePairs,
      derivedRules: result.derivedRules,
      upgrades: result.upgrades,
    });
    if (strategic.length > 0) result.strategicInsights = strategic;
  } catch {
    // best-effort
  }

  return result;
}

// ---- Upgrade insights: learn from PromptVersion diffs ----

const UPGRADE_SECTIONS = [
  { key: "VISUAL STYLE", label: "Visual Style" },
  { key: "FILM STOCK", label: "Film Stock & Lens" },
  { key: "COLOR", label: "Color & Grade" },
  { key: "LIGHTING", label: "Lighting" },
  { key: "CHARACTER", label: "Character" },
  { key: "AUDIO", label: "Audio / Sound" },
  { key: "TIMELINE", label: "Timeline" },
  { key: "QUALITY", label: "Quality Boosters" },
];

function hasSection(prompt: string, key: string): boolean {
  const escaped = key.replace(/ /g, "\\s*");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(prompt);
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "is", "are", "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its", "his", "her", "their", "they", "them", "we", "our", "you", "your", "i", "me", "my", "but", "if", "then", "so", "than", "into", "out", "up", "down", "over", "under", "no", "not",
]);

function bigramsFrom(text: string): string[] {
  const tokens = text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

export async function computeUpgradeInsights(): Promise<UpgradeInsights> {
  // Each PromptVersion = a snapshot of an OLD prompt. We compare it to the CURRENT prompt of the source
  // (or the next-newer PromptVersion for that source if more upgrades happened after).
  const versions = await prisma.promptVersion.findMany({
    orderBy: [{ sourceId: "asc" }, { version: "asc" }],
    select: { id: true, sourceId: true, version: true, prompt: true, triggeredBy: true, createdAt: true },
    take: 2000,
  });
  if (versions.length === 0) {
    return {
      totalUpgrades: 0,
      byTrigger: {},
      avgWordDelta: 0,
      avgWordPctDelta: 0,
      avgLinesAdded: 0,
      avgLinesRemoved: 0,
      topAddedPhrases: [],
      topRemovedPhrases: [],
      sectionGrowth: [],
      patterns: ["אין עדיין שדרוגים — לחץ 'צור פרומפט מחדש' או הפעל Auto-Improvement כדי שהמערכת תתחיל ללמוד מההבדלים."],
    };
  }

  // Group by source so we can chain: v1 → v2 → ... → current
  const bySource: Record<string, typeof versions> = {};
  for (const v of versions) (bySource[v.sourceId] ||= []).push(v);

  // Fetch current prompts for all relevant sources
  const sourceIds = Object.keys(bySource);
  const sources = await prisma.learnSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, prompt: true },
  });
  const currentMap: Record<string, string> = {};
  for (const s of sources) currentMap[s.id] = s.prompt;

  // Build pairs: each version (old) → its successor (newer version of same source, or current source.prompt)
  type Pair = { old: string; new: string; trigger: string };
  const pairs: Pair[] = [];
  for (const sid of sourceIds) {
    const list = bySource[sid].sort((a, b) => a.version - b.version);
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const nextPrompt = i + 1 < list.length ? list[i + 1].prompt : currentMap[sid];
      if (!nextPrompt) continue;
      pairs.push({ old: v.prompt, new: nextPrompt, trigger: v.triggeredBy || "manual" });
    }
  }

  if (pairs.length === 0) {
    return {
      totalUpgrades: 0,
      byTrigger: {},
      avgWordDelta: 0,
      avgWordPctDelta: 0,
      avgLinesAdded: 0,
      avgLinesRemoved: 0,
      topAddedPhrases: [],
      topRemovedPhrases: [],
      sectionGrowth: [],
      patterns: [],
    };
  }

  const byTrigger: Record<string, number> = {};
  let wordDeltaSum = 0;
  let wordPctSum = 0;
  let linesAddedSum = 0;
  let linesRemovedSum = 0;
  const addedBigramCount: Record<string, number> = {};
  const removedBigramCount: Record<string, number> = {};
  const sectionAddedCount: Record<string, number> = {};
  for (const s of UPGRADE_SECTIONS) sectionAddedCount[s.label] = 0;

  for (const p of pairs) {
    byTrigger[p.trigger] = (byTrigger[p.trigger] || 0) + 1;
    const oldWords = p.old.trim().split(/\s+/).length;
    const newWords = p.new.trim().split(/\s+/).length;
    wordDeltaSum += newWords - oldWords;
    if (oldWords > 0) wordPctSum += ((newWords - oldWords) / oldWords) * 100;

    const oldLines = new Set(p.old.split("\n").map((l) => l.trim()));
    const newLines = new Set(p.new.split("\n").map((l) => l.trim()));
    for (const l of Array.from(newLines)) if (!oldLines.has(l) && l.length > 5) linesAddedSum++;
    for (const l of Array.from(oldLines)) if (!newLines.has(l) && l.length > 5) linesRemovedSum++;

    // Bigrams added (in NEW but not in OLD)
    const oldBigrams = new Set(bigramsFrom(p.old));
    const newBigrams = bigramsFrom(p.new);
    const seenAdded = new Set<string>();
    for (const bg of newBigrams) {
      if (!oldBigrams.has(bg) && !seenAdded.has(bg)) {
        seenAdded.add(bg);
        addedBigramCount[bg] = (addedBigramCount[bg] || 0) + 1;
      }
    }
    const newBigramsSet = new Set(newBigrams);
    const seenRemoved = new Set<string>();
    for (const bg of Array.from(oldBigrams)) {
      if (!newBigramsSet.has(bg) && !seenRemoved.has(bg)) {
        seenRemoved.add(bg);
        removedBigramCount[bg] = (removedBigramCount[bg] || 0) + 1;
      }
    }

    // Section growth
    for (const s of UPGRADE_SECTIONS) {
      if (!hasSection(p.old, s.key) && hasSection(p.new, s.key)) {
        sectionAddedCount[s.label]++;
      }
    }
  }

  const n = pairs.length;
  const topAdded = Object.entries(addedBigramCount)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([phrase, addedIn]) => ({ phrase, addedIn }));
  const topRemoved = Object.entries(removedBigramCount)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([phrase, removedIn]) => ({ phrase, removedIn }));
  const sectionGrowth = UPGRADE_SECTIONS
    .map((s) => ({ section: s.label, addedPct: Math.round((sectionAddedCount[s.label] / n) * 100) }))
    .filter((x) => x.addedPct > 0)
    .sort((a, b) => b.addedPct - a.addedPct);

  // Build human-readable patterns in Hebrew
  const patterns: string[] = [];
  const avgDelta = Math.round(wordDeltaSum / n);
  const avgPct = Math.round(wordPctSum / n);
  patterns.push(`בממוצע השדרוג מוסיף ${avgDelta > 0 ? "+" : ""}${avgDelta} מילים (${avgPct > 0 ? "+" : ""}${avgPct}%) לפרומפט.`);
  if (sectionGrowth.length > 0) {
    const top3 = sectionGrowth.slice(0, 3).map((s) => `${s.section} (${s.addedPct}%)`).join(", ");
    patterns.push(`הסעיפים שנוספים הכי הרבה: ${top3}.`);
  }
  if (topAdded.length >= 3) {
    const phrases = topAdded.slice(0, 5).map((p) => `"${p.phrase}"`).join(", ");
    patterns.push(`ביטויים שחוזרים בהרבה שדרוגים: ${phrases}.`);
  }
  if (Object.keys(byTrigger).length > 0) {
    const triggerSummary = Object.entries(byTrigger).map(([t, c]) => `${t}: ${c}`).join(" · ");
    patterns.push(`פילוח טריגרים: ${triggerSummary}.`);
  }

  return {
    totalUpgrades: n,
    byTrigger,
    avgWordDelta: avgDelta,
    avgWordPctDelta: avgPct,
    avgLinesAdded: Math.round(linesAddedSum / n),
    avgLinesRemoved: Math.round(linesRemovedSum / n),
    topAddedPhrases: topAdded,
    topRemovedPhrases: topRemoved,
    sectionGrowth,
    patterns,
  };
}
