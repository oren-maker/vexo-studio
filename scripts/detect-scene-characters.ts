/**
 * For every scene in the target episode, detect which cast members are
 * actually mentioned in the scriptText and persist to memoryContext.characters.
 * The scene-video generate path filters the cast passed to Sora to only these
 * names — without this, ALL episode characters get forced into every clip
 * (which Sora then tries to render on-screen, blowing identity).
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";
(async () => {
  const ep = await p.episode.findUnique({
    where: { id: EPISODE_ID },
    include: {
      scenes: { orderBy: { sceneNumber: "asc" } },
      characters: { include: { character: { select: { name: true } } } },
    },
  });
  if (!ep) { console.error("episode not found"); process.exit(1); }
  const cast = ep.characters.map((c) => c.character.name);
  console.log(`Cast: ${cast.join(", ")}\n`);

  for (const s of ep.scenes) {
    const text = [s.title, s.summary, s.scriptText].filter(Boolean).join(" ").toLowerCase();
    // A character is "in" the scene if their full name OR first name OR last name appears.
    const present = cast.filter((name) => {
      const parts = name.toLowerCase().split(/\s+/);
      if (text.includes(name.toLowerCase())) return true;
      if (parts.length >= 2) {
        // First name match (≥3 chars to skip Dr./Mr./etc.)
        if (parts[0].length >= 3 && text.includes(parts[0])) return true;
        // Last name match
        if (parts[parts.length - 1].length >= 3 && text.includes(parts[parts.length - 1])) return true;
      }
      return false;
    });
    const existingMem = (s.memoryContext as any) ?? {};
    const updated = { ...existingMem, characters: present };
    await p.scene.update({ where: { id: s.id }, data: { memoryContext: updated as object } });
    console.log(`SC${String(s.sceneNumber).padStart(2, "0")} "${s.title}" → [${present.join(", ") || "—"}]`);
  }
  console.log(`\n✅ Done — scenes now filter cast passed to Sora.`);
  await p.$disconnect();
})();
