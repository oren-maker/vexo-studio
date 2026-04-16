import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  // List all characters + their episode linkage counts
  const chars = await p.character.findMany({
    include: { appearances: { include: { episode: { select: { id: true, episodeNumber: true, title: true, seasonId: true } } } } },
    orderBy: { name: "asc" },
  });
  console.log(`Total characters: ${chars.length}\n`);
  for (const c of chars) {
    console.log(`${c.name} (${c.roleType ?? "—"}) → ${c.appearances.length} episode links`);
    for (const a of c.appearances) {
      console.log(`   EP${String(a.episode.episodeNumber).padStart(2,"0")}: "${a.episode.title}" — season ${a.episode.seasonId.slice(0, 8)}…`);
    }
  }
  await p.$disconnect();
})();
