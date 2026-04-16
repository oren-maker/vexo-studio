/**
 * Gemini generated EP01 scripts using "Mira Chen" (from the episode synopsis)
 * but the actual Protagonist character in the DB is "Maya Ellis". Rename
 * across every scene script + summary + title, and the episode synopsis too,
 * so the character sheet matches what Sora reads.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";

function swap(text: string | null): string | null {
  if (!text) return text;
  return text
    .replace(/Mira Chen/g, "Maya Ellis")
    .replace(/\bMira\b/g, "Maya")
    .replace(/\bChen\b/g, "Ellis");
}

(async () => {
  const ep = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: { scenes: true },
  });
  if (!ep) { console.error("episode not found"); process.exit(1); }

  if (ep.synopsis && /Mira|Chen/.test(ep.synopsis)) {
    await p.episode.update({ where: { id: EPISODE_ID }, data: { synopsis: swap(ep.synopsis) } });
    console.log(`✓ episode synopsis updated`);
  }

  let changed = 0;
  for (const s of ep.scenes) {
    const newTitle = swap(s.title);
    const newSummary = swap(s.summary);
    const newScript = swap(s.scriptText);
    const changes: Record<string, string | null> = {};
    if (newTitle !== s.title) changes.title = newTitle;
    if (newSummary !== s.summary) changes.summary = newSummary;
    if (newScript !== s.scriptText) changes.scriptText = newScript;
    if (Object.keys(changes).length > 0) {
      await p.scene.update({ where: { id: s.id }, data: changes as any });
      changed++;
      console.log(`  SC${s.sceneNumber} "${s.title}" updated (${Object.keys(changes).join(", ")})`);
    }
  }
  console.log(`\n✅ Renamed in ${changed} scenes. Now re-detecting scene cast…\n`);

  // Re-run cast detection inline
  const ep2 = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: {
      scenes: { orderBy: { sceneNumber: "asc" } },
      characters: { include: { character: { select: { name: true } } } },
    },
  });
  const cast = ep2!.characters.map((c) => c.character.name);
  for (const s of ep2!.scenes) {
    const text = [s.title, s.summary, s.scriptText].filter(Boolean).join(" ").toLowerCase();
    const present = cast.filter((name) => {
      const parts = name.toLowerCase().split(/\s+/);
      if (text.includes(name.toLowerCase())) return true;
      if (parts.length >= 2) {
        if (parts[0].length >= 3 && text.includes(parts[0])) return true;
        if (parts[parts.length - 1].length >= 3 && text.includes(parts[parts.length - 1])) return true;
      }
      return false;
    });
    const existingMem = (s.memoryContext as any) ?? {};
    await p.scene.update({ where: { id: s.id }, data: { memoryContext: { ...existingMem, characters: present } as object } });
    console.log(`SC${String(s.sceneNumber).padStart(2, "0")} → [${present.join(", ") || "—"}]`);
  }

  await p.$disconnect();
})();
