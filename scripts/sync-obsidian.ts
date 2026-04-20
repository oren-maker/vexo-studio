/**
 * Obsidian vault → vexo LearnSource sync.
 *
 * Walks every .md file in VAULT_PATH, computes a content hash, upserts a
 * LearnSource (type="obsidian") keyed by externalId="obsidian:<relpath>".
 * Unchanged files are skipped so re-runs are cheap. Each new or changed
 * file gets embedded via gemini-embedding-001 so the brain's RAG (Phase 1)
 * picks it up on the next chat turn.
 *
 * Usage:
 *   DATABASE_URL=postgres://... GEMINI_API_KEY=... \
 *   VAULT_PATH="/path/to/my/vault" \
 *   npx tsx scripts/sync-obsidian.ts
 *
 * Optional flags:
 *   --dry-run        don't write to DB, just report what would change
 *   --include=TAG    only sync notes that contain #TAG (e.g. #vexo)
 *   --exclude=TAG    skip notes that contain #TAG (e.g. #private)
 *   --delete-missing remove LearnSource rows whose vault file is gone
 *
 * Idempotency: content hash stored inside LearnSource.lineageNotes as a
 * "hash:<sha32>;" prefix so we don't need a schema change. Matching hash
 * = skip the embed call.
 *
 * Notes that are safe to skip: .obsidian/, node_modules/, .trash/, any
 * file starting with "_" (Obsidian convention for draft/private).
 */
import { PrismaClient } from "@prisma/client";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const VAULT_PATH = process.env.VAULT_PATH;
const GEMINI_KEY = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").trim();
const EMBED_MODEL = "gemini-embedding-001";

const DRY_RUN = process.argv.includes("--dry-run");
const DELETE_MISSING = process.argv.includes("--delete-missing");
const INCLUDE_TAG = process.argv.find((a) => a.startsWith("--include="))?.split("=")[1]?.replace(/^#/, "");
const EXCLUDE_TAG = process.argv.find((a) => a.startsWith("--exclude="))?.split("=")[1]?.replace(/^#/, "");

if (!VAULT_PATH) {
  console.error("ERROR: set VAULT_PATH env var to your Obsidian vault directory");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("ERROR: set GEMINI_API_KEY env var");
  process.exit(1);
}

const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules", ".git", ".vscode"]);

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith("_")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, files);
    else if (e.isFile() && e.name.endsWith(".md")) files.push(full);
  }
  return files;
}

type Frontmatter = { title?: string; tags?: string[]; vexo_private?: boolean };

function parseFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  if (!raw.startsWith("---\n")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) return { fm: {}, body: raw };
  const fmText = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const fm: Frontmatter = {};
  for (const line of fmText.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (key === "title") fm.title = val.replace(/^["']|["']$/g, "");
    if (key === "tags") {
      if (val.startsWith("[")) {
        fm.tags = val.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim().replace(/^["']|["']$/g, "").replace(/^#/, ""));
      } else {
        fm.tags = val.split(/\s+/).map((t) => t.replace(/^#/, ""));
      }
    }
    if (key === "vexo_private") fm.vexo_private = val === "true";
  }
  return { fm, body };
}

function extractInlineTags(body: string): string[] {
  const tags = new Set<string>();
  for (const m of body.matchAll(/#([\p{L}\p{N}_\-\/]+)/gu)) {
    tags.add(m[1]);
  }
  return [...tags];
}

async function embedText(text: string): Promise<number[]> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: text.slice(0, 8000) }] },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j: any = await r.json();
  const values: number[] = j?.embedding?.values ?? [];
  if (values.length === 0) throw new Error("empty embedding");
  return values;
}

function sha(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 32);
}

async function main() {
  const root = VAULT_PATH!;
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) {
    console.error(`ERROR: VAULT_PATH is not a directory: ${root}`);
    process.exit(1);
  }

  console.log(`Scanning ${root}${DRY_RUN ? " (dry-run)" : ""}...`);
  if (INCLUDE_TAG) console.log(`  including only notes with #${INCLUDE_TAG}`);
  if (EXCLUDE_TAG) console.log(`  excluding notes with #${EXCLUDE_TAG}`);

  const files = await walk(root);
  console.log(`Found ${files.length} .md files.`);

  const seenExternalIds = new Set<string>();
  let added = 0, updated = 0, skipped = 0, filtered = 0, failed = 0;

  for (const file of files) {
    const rel = relative(root, file).split(sep).join("/");
    const externalId = `obsidian:${rel}`;
    seenExternalIds.add(externalId);
    try {
      const raw = await readFile(file, "utf8");
      const { fm, body } = parseFrontmatter(raw);
      const tags = new Set<string>([...(fm.tags ?? []), ...extractInlineTags(body)]);

      if (fm.vexo_private || tags.has("private") || tags.has("vexo_private")) { filtered++; continue; }
      if (INCLUDE_TAG && !tags.has(INCLUDE_TAG)) { filtered++; continue; }
      if (EXCLUDE_TAG && tags.has(EXCLUDE_TAG)) { filtered++; continue; }
      if (body.trim().length < 30) { filtered++; continue; }

      const title = fm.title || file.split(sep).pop()!.replace(/\.md$/, "");
      const hash = sha(body);

      const existing = await prisma.learnSource.findUnique({ where: { externalId } });
      const existingHash = existing?.lineageNotes?.match(/hash:([a-f0-9]{32})/)?.[1] ?? null;
      if (existing && existingHash === hash) { skipped++; continue; }

      if (DRY_RUN) {
        console.log(`  [DRY] ${existing ? "UPDATE" : "ADD"} ${rel}`);
        existing ? updated++ : added++;
        continue;
      }

      const vec = await embedText(`${title}\n\n${body}`);

      if (existing) {
        await prisma.learnSource.update({
          where: { id: existing.id },
          data: {
            prompt: body.slice(0, 20000),
            title,
            lineageNotes: `hash:${hash};tags:${[...tags].join(",")}`,
            embedding: vec,
            embeddingModel: EMBED_MODEL,
            embeddedAt: new Date(),
            status: "complete",
          },
        });
        updated++;
      } else {
        await prisma.learnSource.create({
          data: {
            externalId,
            type: "obsidian",
            prompt: body.slice(0, 20000),
            title,
            lineageNotes: `hash:${hash};tags:${[...tags].join(",")}`,
            status: "complete",
            addedBy: "obsidian-sync",
            embedding: vec,
            embeddingModel: EMBED_MODEL,
            embeddedAt: new Date(),
          },
        });
        added++;
      }
      console.log(`  ${existing ? "↻" : "+"} ${rel}`);
    } catch (e: any) {
      failed++;
      console.warn(`  ✗ ${rel}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }

  if (DELETE_MISSING && !DRY_RUN) {
    const orphans = await prisma.learnSource.findMany({
      where: { type: "obsidian", externalId: { notIn: [...seenExternalIds] } },
      select: { id: true, externalId: true },
    });
    if (orphans.length > 0) {
      console.log(`Deleting ${orphans.length} orphan rows (file removed from vault)...`);
      await prisma.learnSource.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    }
  }

  console.log(
    `\nDone: +${added} added, ↻${updated} updated, =${skipped} unchanged, ⊘${filtered} filtered, ✗${failed} failed.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
