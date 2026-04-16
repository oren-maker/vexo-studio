// Hourly insights snapshots: compute the full CorpusInsights, store it,
// compare with the previous snapshot, save the delta.

import { prisma } from "./db";
import { computeCorpusInsights, type CorpusInsights } from "./corpus-insights";

export type SnapshotDelta = {
  sourcesAdded: number;
  nodesAdded: number;
  avgTechniquesChange: number;
  avgWordsChange: number;
  timecodePctChange: number;
  newTechniques: Array<{ name: string; count: number }>;
  lostTechniques: Array<{ name: string }>;
  newStyles: Array<{ name: string; count: number }>;
  risingTechniques: Array<{ name: string; deltaCount: number }>;
  fallingTechniques: Array<{ name: string; deltaCount: number }>;
  newRules: string[];
};

function diffFrequencyList(
  prev: Array<{ name: string; count: number }>,
  curr: Array<{ name: string; count: number }>,
): {
  added: Array<{ name: string; count: number }>;
  removed: Array<{ name: string }>;
  rising: Array<{ name: string; deltaCount: number }>;
  falling: Array<{ name: string; deltaCount: number }>;
} {
  const prevMap: Record<string, number> = {};
  for (const p of prev) prevMap[p.name] = p.count;
  const currMap: Record<string, number> = {};
  for (const p of curr) currMap[p.name] = p.count;
  const added: Array<{ name: string; count: number }> = [];
  const removed: Array<{ name: string }> = [];
  const rising: Array<{ name: string; deltaCount: number }> = [];
  const falling: Array<{ name: string; deltaCount: number }> = [];

  for (const name of Object.keys(currMap)) {
    const count = currMap[name];
    const prevCount = prevMap[name];
    if (prevCount === undefined) {
      added.push({ name, count });
    } else if (count > prevCount) {
      rising.push({ name, deltaCount: count - prevCount });
    } else if (count < prevCount) {
      falling.push({ name, deltaCount: count - prevCount });
    }
  }
  for (const name of Object.keys(prevMap)) {
    if (!(name in currMap)) removed.push({ name });
  }
  return {
    added: added.sort((a, b) => b.count - a.count),
    removed,
    rising: rising.sort((a, b) => b.deltaCount - a.deltaCount),
    falling: falling.sort((a, b) => a.deltaCount - b.deltaCount),
  };
}

function computeDelta(prev: CorpusInsights, curr: CorpusInsights): SnapshotDelta {
  // Older snapshots may have missing fields if the CorpusInsights shape changed
  // over time. Default everything to [] so .map / Set don't blow up.
  const safePrevTechniques = Array.isArray(prev?.topTechniques) ? prev.topTechniques : [];
  const safeCurrTechniques = Array.isArray(curr?.topTechniques) ? curr.topTechniques : [];
  const safePrevStyles = Array.isArray(prev?.topStyles) ? prev.topStyles : [];
  const safeCurrStyles = Array.isArray(curr?.topStyles) ? curr.topStyles : [];
  const safePrevRules = Array.isArray(prev?.derivedRules) ? prev.derivedRules : [];
  const safeCurrRules = Array.isArray(curr?.derivedRules) ? curr.derivedRules : [];

  const techDiff = diffFrequencyList(
    safePrevTechniques.map((t) => ({ name: t.name, count: t.count })),
    safeCurrTechniques.map((t) => ({ name: t.name, count: t.count })),
  );
  const styleDiff = diffFrequencyList(
    safePrevStyles.map((s) => ({ name: s.name, count: s.count })),
    safeCurrStyles.map((s) => ({ name: s.name, count: s.count })),
  );

  const prevRules = new Set(safePrevRules);
  const newRules = safeCurrRules.filter((r) => !prevRules.has(r));

  return {
    sourcesAdded: curr.totals.sources - prev.totals.sources,
    nodesAdded: curr.totals.knowledgeNodes - prev.totals.knowledgeNodes,
    avgTechniquesChange:
      Math.round((curr.totals.avgTechniquesPerPrompt - prev.totals.avgTechniquesPerPrompt) * 100) / 100,
    avgWordsChange: curr.totals.avgWordsPerPrompt - prev.totals.avgWordsPerPrompt,
    timecodePctChange:
      Math.round(
        ((curr.totals.promptsWithTimecodes / Math.max(curr.totals.sources, 1)) -
          (prev.totals.promptsWithTimecodes / Math.max(prev.totals.sources, 1))) * 100,
      ),
    newTechniques: techDiff.added.slice(0, 10),
    lostTechniques: techDiff.removed.slice(0, 10),
    newStyles: styleDiff.added.slice(0, 5),
    risingTechniques: techDiff.rising.slice(0, 8),
    fallingTechniques: techDiff.falling.slice(0, 8),
    newRules,
  };
}

function summarize(delta: SnapshotDelta): string {
  const parts: string[] = [];
  if (delta.sourcesAdded > 0) parts.push(`+${delta.sourcesAdded} מקורות`);
  else if (delta.sourcesAdded < 0) parts.push(`${delta.sourcesAdded} מקורות`);
  if (delta.nodesAdded) parts.push(`${delta.nodesAdded > 0 ? "+" : ""}${delta.nodesAdded} Knowledge Nodes`);
  if (delta.newStyles.length) parts.push(`סגנונות חדשים: ${delta.newStyles.map((s) => s.name).join(", ")}`);
  if (delta.newTechniques.length >= 3)
    parts.push(`${delta.newTechniques.length} טכניקות חדשות (${delta.newTechniques.slice(0, 3).map((t) => t.name).join(", ")}…)`);
  if (Math.abs(delta.avgTechniquesChange) >= 0.2)
    parts.push(
      `ממוצע טכניקות/פרומפט ${delta.avgTechniquesChange > 0 ? "עלה" : "ירד"} ב-${Math.abs(delta.avgTechniquesChange)}`,
    );
  if (Math.abs(delta.timecodePctChange) >= 5)
    parts.push(`% timecodes השתנה ב-${delta.timecodePctChange > 0 ? "+" : ""}${delta.timecodePctChange}%`);
  if (delta.newRules.length) parts.push(`${delta.newRules.length} כללים חדשים`);
  if (parts.length === 0) return "אין שינוי משמעותי מאז הצילום הקודם.";
  return parts.join(" · ");
}

export async function snapshotInsights(): Promise<{
  snapshotId: string;
  hadPrevious: boolean;
  summary: string;
}> {
  const curr = await computeCorpusInsights();
  const previous = await prisma.insightsSnapshot.findFirst({ orderBy: { takenAt: "desc" } });

  let delta: SnapshotDelta | null = null;
  let summary = "Snapshot ראשון — אין מול מה להשוות.";
  if (previous) {
    const prevInsights = previous.data as unknown as CorpusInsights;
    delta = computeDelta(prevInsights, curr);
    summary = summarize(delta);
  }

  const saved = await prisma.insightsSnapshot.create({
    data: {
      sourcesCount: curr.totals.sources,
      analysesCount: curr.totals.analyses,
      nodesCount: curr.totals.knowledgeNodes,
      avgTechniques: curr.totals.avgTechniquesPerPrompt,
      avgWords: curr.totals.avgWordsPerPrompt,
      timecodePct: Math.round(
        (curr.totals.promptsWithTimecodes / Math.max(curr.totals.sources, 1)) * 100,
      ),
      data: curr as any,
      delta: (delta as any) || null,
      summary,
    },
  });

  return { snapshotId: saved.id, hadPrevious: !!previous, summary };
}
