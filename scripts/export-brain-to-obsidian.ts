/**
 * Brain → Obsidian vault export.
 *
 * Pulls the live production state from the DB and writes it as a tree of
 * markdown files in the vault at `<VAULT_PATH>/_vexo/`. Folders:
 *   _vexo/Series/<title>.md
 *   _vexo/Seasons/<series> · S<n>.md
 *   _vexo/Episodes/<series> · S<n>E<n> — <title>.md
 *   _vexo/Scenes/<series> · S<n>E<n>SC<n>.md
 *   _vexo/Characters/<name>.md
 *   _vexo/Knowledge/<kind>/<name>.md   (BrainReference)
 *
 * Underscore prefix on `_vexo/` makes sync-obsidian.ts skip these files
 * automatically — they're for reading, not for re-ingesting back into RAG.
 *
 * Every file uses Obsidian [[wikilinks]] to peer entities, so the graph
 * view lights up immediately. Re-running the script overwrites; deleted
 * entities in the DB stay as orphan .md files (safer than auto-delete).
 *
 * Usage:
 *   DATABASE_URL=... VAULT_PATH=... npx tsx scripts/export-brain-to-obsidian.ts
 *   # or:
 *   npm run export:obsidian
 */
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";

const prisma = new PrismaClient();
const VAULT_PATH = process.env.VAULT_PATH;

if (!VAULT_PATH) {
  console.error("ERROR: VAULT_PATH env var required");
  process.exit(1);
}

const ROOT = join(VAULT_PATH, "_vexo");

function sanitize(s: string): string {
  // Obsidian file names can't contain: / \ : * ? " < > |
  return s.replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "untitled";
}

function wikilink(label: string): string { return `[[${sanitize(label)}]]`; }

function frontmatter(data: Record<string, unknown>): string {
  const lines = ["---", "auto_generated: true"];
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => JSON.stringify(String(x))).join(", ")}]`);
    else if (typeof v === "string") lines.push(`${k}: ${JSON.stringify(v)}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

async function writeMd(filePath: string, body: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
}

async function main() {
  // Clean slate — nuke the _vexo/ subtree so stale files don't linger
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(ROOT, { recursive: true });

  console.log(`Exporting brain state to ${ROOT}...`);

  const [seriesRows, charsRows, refsRows] = await Promise.all([
    prisma.series.findMany({
      include: {
        seasons: {
          orderBy: { seasonNumber: "asc" },
          include: {
            episodes: {
              orderBy: { episodeNumber: "asc" },
              include: {
                scenes: { orderBy: { sceneNumber: "asc" } },
                characters: { include: { character: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.character.findMany({
      include: {
        media: { take: 1, orderBy: { createdAt: "asc" } },
        appearances: { include: { episode: { select: { episodeNumber: true, title: true, season: { select: { seasonNumber: true, series: { select: { title: true } } } } } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.brainReference.findMany({
      where: { validTo: null },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  ]);

  let seriesCount = 0, seasonCount = 0, epCount = 0, sceneCount = 0, charCount = 0, refCount = 0;

  // ---------- Series → Seasons → Episodes → Scenes ----------
  for (const sr of seriesRows) {
    seriesCount++;
    const seriesSlug = sanitize(sr.title);
    const seriesEpisodes = sr.seasons.flatMap((s) => s.episodes);

    const seriesBody = [
      frontmatter({ kind: "series", id: sr.id, genre: sr.genre ?? undefined, status: sr.budgetStatus, projectId: sr.projectId }),
      `# ${sr.title}`,
      "",
      sr.summary ? sr.summary : "_(אין סיכום עדיין — השתמש ב-generate_series_summary)_",
      "",
      "## עונות",
      ...sr.seasons.map((s) => `- ${wikilink(`${seriesSlug} · S${s.seasonNumber}`)} — ${s.episodes.length} פרקים`),
      "",
      "## כל הפרקים",
      ...seriesEpisodes.map((e) => `- ${wikilink(`${seriesSlug} · S${e.seasonId ? "?" : "?"}E${e.episodeNumber} — ${e.title}`)}`),
      "",
      `## עלות: $${sr.actualCost.toFixed(2)} · הכנסה: $${sr.revenueTotal.toFixed(2)}`,
    ].join("\n");
    await writeMd(join(ROOT, "Series", `${seriesSlug}.md`), seriesBody);

    for (const sn of sr.seasons) {
      seasonCount++;
      const seasonKey = `${seriesSlug} · S${sn.seasonNumber}`;
      const seasonBody = [
        frontmatter({ kind: "season", id: sn.id, seasonNumber: sn.seasonNumber, status: sn.status }),
        `# ${seasonKey}${sn.title ? ` — ${sn.title}` : ""}`,
        "",
        sn.description ?? "",
        "",
        `סדרה: ${wikilink(seriesSlug)}`,
        "",
        "## פרקים",
        ...sn.episodes.map((e) => `- ${wikilink(`${seriesSlug} · S${sn.seasonNumber}E${e.episodeNumber} — ${e.title}`)} · ${e.status}`),
      ].join("\n");
      await writeMd(join(ROOT, "Seasons", `${seasonKey}.md`), seasonBody);

      for (const ep of sn.episodes) {
        epCount++;
        const epKey = `${seriesSlug} · S${sn.seasonNumber}E${ep.episodeNumber} — ${ep.title}`;
        const castLinks = ep.characters.map((ec) => wikilink(ec.character.name)).join(", ");
        const epBody = [
          frontmatter({
            kind: "episode", id: ep.id, episodeNumber: ep.episodeNumber, status: ep.status,
            targetDurationSeconds: ep.targetDurationSeconds ?? undefined,
          }),
          `# ${epKey}`,
          "",
          ep.synopsis ?? "_(אין סינופסיס)_",
          "",
          `עונה: ${wikilink(seasonKey)} · סדרה: ${wikilink(seriesSlug)}`,
          "",
          castLinks ? `## שחקנים\n${castLinks}` : "",
          "",
          "## סצנות",
          ...ep.scenes.map((sc) => `- ${wikilink(`${seriesSlug} · S${sn.seasonNumber}E${ep.episodeNumber}SC${sc.sceneNumber}`)}${sc.title ? ` — ${sc.title}` : ""} · ${sc.status}`),
          "",
          `## עלות מצטברת: $${ep.actualCost.toFixed(4)}`,
        ].join("\n");
        await writeMd(join(ROOT, "Episodes", `${epKey}.md`), epBody);

        for (const sc of ep.scenes) {
          sceneCount++;
          const scKey = `${seriesSlug} · S${sn.seasonNumber}E${ep.episodeNumber}SC${sc.sceneNumber}`;
          const mem = (sc.memoryContext as Record<string, unknown> | null) ?? {};
          const sceneBody = [
            frontmatter({
              kind: "scene", id: sc.id, sceneNumber: sc.sceneNumber, status: sc.status,
              targetDurationSeconds: sc.targetDurationSeconds ?? undefined,
              scriptSource: sc.scriptSource ?? undefined,
            }),
            `# ${scKey}${sc.title ? ` — ${sc.title}` : ""}`,
            "",
            `פרק: ${wikilink(epKey)} · עונה: ${wikilink(seasonKey)} · סדרה: ${wikilink(seriesSlug)}`,
            "",
            sc.summary ? `## Summary\n${sc.summary}\n` : "",
            sc.scriptText ? `## Script\n\n\`\`\`\n${sc.scriptText}\n\`\`\`` : "_(אין scriptText)_",
            "",
            mem.directorNotes ? `## הערות במאי\n${mem.directorNotes}\n` : "",
            mem.soundNotes ? `## הערות סאונד\n${mem.soundNotes}\n` : "",
            typeof mem.bridgeFrameUrl === "string" ? `## Bridge frame\n![bridge](${mem.bridgeFrameUrl})\n` : "",
            Array.isArray(mem.shotList) ? `## Shot list (${(mem.shotList as unknown[]).length} shots)\n\`\`\`json\n${JSON.stringify(mem.shotList, null, 2).slice(0, 2000)}\n\`\`\`` : "",
            "",
            `[פתח ב-vexo-studio →](https://vexo-studio.vercel.app/scenes/${sc.id})`,
          ].filter(Boolean).join("\n");
          await writeMd(join(ROOT, "Scenes", `${scKey}.md`), sceneBody);
        }
      }
    }
  }

  // ---------- Characters ----------
  for (const c of charsRows) {
    charCount++;
    const appearIn = c.appearances
      .map((a) => a.episode ? `${sanitize(a.episode.season?.series?.title ?? "")} · S${a.episode.season?.seasonNumber ?? "?"}E${a.episode.episodeNumber ?? "?"} — ${a.episode.title ?? ""}` : null)
      .filter((s): s is string => !!s);
    const body = [
      frontmatter({ kind: "character", id: c.id, roleType: c.roleType ?? undefined, gender: c.gender ?? undefined, ageRange: c.ageRange ?? undefined }),
      `# ${c.name}`,
      "",
      c.media[0] ? `![portrait](${c.media[0].fileUrl})\n` : "",
      c.appearance ? `## מראה\n${c.appearance}\n` : "",
      c.personality ? `## אישיות\n${c.personality}\n` : "",
      c.wardrobeRules ? `## תלבושת\n${c.wardrobeRules}\n` : "",
      c.speechStyle ? `## סגנון דיבור\n${c.speechStyle}\n` : "",
      c.notes ? `## הערות\n${c.notes}\n` : "",
      "",
      appearIn.length > 0 ? `## מופיעה ב\n${appearIn.map(wikilink).map((l) => `- ${l}`).join("\n")}` : "",
      "",
      `[פתח ב-vexo-studio →](https://vexo-studio.vercel.app/characters/${c.id})`,
    ].filter(Boolean).join("\n");
    await writeMd(join(ROOT, "Characters", `${sanitize(c.name)}.md`), body);
  }

  // ---------- BrainReference (Knowledge) ----------
  for (const r of refsRows) {
    refCount++;
    const body = [
      frontmatter({ kind: "brain-reference", id: r.id, refKind: r.kind, version: r.version, tags: r.tags }),
      `# ${r.name}`,
      "",
      `_${r.kind}_`,
      "",
      `## תקציר\n${r.shortDesc}`,
      "",
      `## פירוט\n${r.longDesc}`,
      "",
      `[פתח ב-vexo-studio →](https://vexo-studio.vercel.app/learn/knowledge?tab=${r.kind})`,
    ].join("\n");
    await writeMd(join(ROOT, "Knowledge", r.kind, `${sanitize(r.name)}.md`), body);
  }

  // ---------- Index ----------
  const index = [
    frontmatter({ auto_generated: true, kind: "index" }),
    `# _vexo — Brain Export`,
    "",
    `עודכן אוטומטית מ-vexo-studio. **אל תערוך ידנית** — השינויים יימחקו בסנכרון הבא.`,
    "",
    `## תכולה`,
    `- ${seriesCount} סדרות`,
    `- ${seasonCount} עונות`,
    `- ${epCount} פרקים`,
    `- ${sceneCount} סצנות`,
    `- ${charCount} דמויות`,
    `- ${refCount} BrainReferences`,
    "",
    `## מבנה`,
    `- \`Series/\` — סדרות`,
    `- \`Seasons/\` — עונות`,
    `- \`Episodes/\` — פרקים`,
    `- \`Scenes/\` — סצנות (scriptText + memoryContext)`,
    `- \`Characters/\` — דמויות + פורטרטים`,
    `- \`Knowledge/<kind>/\` — BrainReferences (emotion/sound/cinematography/capability)`,
    "",
    `[חזור ל-vexo-studio](https://vexo-studio.vercel.app)`,
  ].join("\n");
  await writeMd(join(ROOT, "index.md"), index);

  console.log(`Done: ${seriesCount} series, ${seasonCount} seasons, ${epCount} episodes, ${sceneCount} scenes, ${charCount} characters, ${refCount} references.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
