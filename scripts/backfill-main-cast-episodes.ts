/**
 * Backfill main-cast episode links.
 *
 * Auto-populate only flagged each character for the one episode it detected them in.
 * For MAIN roles (Protagonist, Antagonist, Mentor Figure, Supporting Character) we
 * want them linked to EVERY episode in the same project — they are recurring.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const RECURRING_ROLES = new Set([
  "Protagonist",
  "Antagonist",
  "Mentor Figure",
  "Supporting Character",
  "Friend",
  "Teacher",
]);

(async () => {
  const chars = await p.character.findMany({
    include: {
      appearances: { select: { episodeId: true } },
      project: {
        include: {
          series: { include: { seasons: { include: { episodes: { select: { id: true, episodeNumber: true, title: true } } } } } },
        },
      },
    },
  });

  let totalAdded = 0;
  for (const c of chars) {
    if (!c.roleType || !RECURRING_ROLES.has(c.roleType)) {
      console.log(`skip ${c.name} (role=${c.roleType ?? "—"})`);
      continue;
    }
    const allEpIds = c.project.series.flatMap((s) => s.seasons.flatMap((se) => se.episodes.map((e) => e.id)));
    const existing = new Set(c.appearances.map((a) => a.episodeId));
    const missing = allEpIds.filter((id) => !existing.has(id));
    if (missing.length === 0) {
      console.log(`ok   ${c.name} — already linked to all ${allEpIds.length} episodes`);
      continue;
    }
    await p.episodeCharacter.createMany({
      data: missing.map((epId) => ({ episodeId: epId, characterId: c.id })),
      skipDuplicates: true,
    });
    totalAdded += missing.length;
    console.log(`add  ${c.name} — +${missing.length} episode links (now ${existing.size + missing.length}/${allEpIds.length})`);
  }
  console.log(`\nDone. Total EpisodeCharacter rows added: ${totalAdded}`);
  await p.$disconnect();
})();
