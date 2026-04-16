/**
 * Delta Engine — compares any two InsightsSnapshots and produces a structured
 * diff that the brain reads as "what changed and what to learn from it."
 *
 * Called by the daily cron AFTER every sync/analysis step. The delta is stored
 * in the new snapshot's `delta` JSON field, and the brain's system prompt
 * reads the latest delta to know what improved/degraded since last time.
 */
import { prisma } from "@/lib/prisma";

export type DeltaResult = {
  period: string;
  sourcesAdded: number;
  nodesAdded: number;
  techniquesDelta: number;
  timecodeDelta: number;
  seriesChanges: SeriesDelta[];
  learnings: string[];
};

type SeriesDelta = {
  name: string;
  episodesDelta: number;
  scenesDelta: number;
  costDelta: number;
  readyDelta: number;
};

export async function computeLatestDelta(kind: string = "hourly"): Promise<DeltaResult | null> {
  const [latest, previous] = await prisma.insightsSnapshot.findMany({
    where: { kind },
    orderBy: { takenAt: "desc" },
    take: 2,
  });
  if (!latest || !previous) return null;
  return computeDelta(previous, latest);
}

export function computeDelta(old: any, now: any): DeltaResult {
  const sourcesAdded = (now.sourcesCount ?? 0) - (old.sourcesCount ?? 0);
  const nodesAdded = (now.nodesCount ?? 0) - (old.nodesCount ?? 0);
  const techniquesDelta = +((now.avgTechniques ?? 0) - (old.avgTechniques ?? 0)).toFixed(2);
  const timecodeDelta = (now.timecodePct ?? 0) - (old.timecodePct ?? 0);

  // Series-level delta (if both have production data)
  const seriesChanges: SeriesDelta[] = [];
  const oldProjects: any[] = Array.isArray(old.data) ? old.data : [];
  const nowProjects: any[] = Array.isArray(now.data) ? now.data : [];
  const oldByName = new Map(oldProjects.map((p: any) => [p.name, p]));
  for (const np of nowProjects) {
    const op = oldByName.get(np.name);
    if (op) {
      seriesChanges.push({
        name: np.name,
        episodesDelta: (np.episodes ?? 0) - (op.episodes ?? 0),
        scenesDelta: (np.scenes ?? 0) - (op.scenes ?? 0),
        costDelta: +((np.totalCostUsd ?? 0) - (op.totalCostUsd ?? 0)).toFixed(2),
        readyDelta: (np.readyScenes ?? 0) - (op.readyScenes ?? 0),
      });
    }
  }

  // Generate natural-language learnings from the delta
  const learnings: string[] = [];
  if (sourcesAdded > 0) learnings.push(`נוספו ${sourcesAdded} פרומפטים חדשים למאגר`);
  if (sourcesAdded < 0) learnings.push(`${Math.abs(sourcesAdded)} פרומפטים הוסרו`);
  if (nodesAdded > 5) learnings.push(`${nodesAdded} נקודות ידע חדשות נלמדו — המוח התרחב`);
  if (techniquesDelta > 0.2) learnings.push(`ממוצע הטכניקות עלה ב-${techniquesDelta} — הפרומפטים יותר עשירים`);
  if (techniquesDelta < -0.2) learnings.push(`ממוצע הטכניקות ירד ב-${Math.abs(techniquesDelta)} — בדוק אם יש ירידה באיכות`);
  if (timecodeDelta > 3) learnings.push(`שיפור של ${timecodeDelta}% בשימוש ב-timecodes`);
  for (const sc of seriesChanges) {
    if (sc.scenesDelta > 0) learnings.push(`${sc.name}: +${sc.scenesDelta} סצנות חדשות`);
    if (sc.readyDelta > 0) learnings.push(`${sc.name}: +${sc.readyDelta} סצנות מוכנות — התקדמות`);
    if (sc.costDelta > 5) learnings.push(`${sc.name}: +$${sc.costDelta} בהוצאות — לבדוק יעילות`);
  }
  if (learnings.length === 0) learnings.push("אין שינויים משמעותיים מאז הסנכרון האחרון");

  const oldDate = new Date(old.takenAt).toLocaleDateString("he-IL");
  const nowDate = new Date(now.takenAt).toLocaleDateString("he-IL");

  return {
    period: `${oldDate} → ${nowDate}`,
    sourcesAdded, nodesAdded, techniquesDelta, timecodeDelta,
    seriesChanges, learnings,
  };
}

/**
 * Compute delta and store it on the latest snapshot. Called after every
 * sync operation that creates an InsightsSnapshot.
 */
export async function attachDeltaToLatest(kind: string = "hourly"): Promise<DeltaResult | null> {
  const delta = await computeLatestDelta(kind);
  if (!delta) return null;

  const latest = await prisma.insightsSnapshot.findFirst({
    where: { kind },
    orderBy: { takenAt: "desc" },
  });
  if (latest) {
    await prisma.insightsSnapshot.update({
      where: { id: latest.id },
      data: { delta: delta as object },
    });
  }
  return delta;
}
