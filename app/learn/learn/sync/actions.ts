"use server";

import { syncSeedanceRepo } from "@/lib/learn/seedance-parser";
import { syncCeDanceRepo } from "@/lib/learn/github-cedance";
import { syncAllRegistry } from "@/lib/learn/generic-md-parser";
import { extractAllPending } from "@/lib/learn/gemini-knowledge";
import { extractAllDeterministic } from "@/lib/learn/text-knowledge-extractor";
import { prisma } from "@/lib/learn/db";

// Sync all extra curated repos (hr98w/awesome-sora-prompts, SoraEase, etc.)
export async function runMultiSyncAction() {
  try {
    const results = await syncAllRegistry();
    const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
    const totalUpserted = results.reduce((s, r) => s + r.upserted, 0);
    const errors = results.flatMap((r) => r.errors);
    return { ok: true as const, fetched: totalFetched, upserted: totalUpserted, perRepo: results, errors };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}

// Extract knowledge from all sources that don't have analysis yet (Gemini - slow, requires quota).
export async function runKnowledgeExtractionAction(limit = 200) {
  try {
    const r = await extractAllPending(limit);
    return { ok: true as const, ...r };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}

// Pattern-based extraction (no LLM, instant, runs on the full corpus).
export async function runPatternExtractionAction() {
  try {
    const r = await extractAllDeterministic();
    return { ok: true as const, ...r };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}

// --- Seedance one-click ---
export async function runSeedanceSyncAction() {
  try {
    const result = await syncSeedanceRepo();
    return { ok: true as const, ...result };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}

// --- Generic GitHub repo (owner/repo/path) ---
export async function runGithubSyncAction(input: {
  owner: string;
  repo: string;
  path: string;
  token?: string;
}) {
  try {
    const result = await syncCeDanceRepo({
      owner: input.owner.trim(),
      repo: input.repo.trim(),
      path: input.path.trim(),
      token: input.token?.trim() || process.env.GITHUB_TOKEN || undefined,
    });
    return { ok: true as const, ...result };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}

// --- Paste JSON (array or {prompts: [...]} ) ---
export async function runJsonImportAction(rawJson: string) {
  try {
    const parsed = JSON.parse(rawJson);
    const items: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.prompts)
      ? parsed.prompts
      : [];
    if (items.length === 0) return { ok: false as const, error: "JSON ריק או לא בפורמט הצפוי" };

    let created = 0;
    let upserted = 0;
    const errors: string[] = [];

    for (const raw of items) {
      const prompt = String(raw.prompt || raw.text || "").trim();
      if (prompt.length < 10) {
        errors.push(`skip: prompt too short`);
        continue;
      }
      const title = raw.title || raw.name || null;
      const videoUrl = raw.videoUrl || raw.video || raw.url_video || null;
      const thumbnail = raw.thumbnail || raw.image || null;
      const externalId = raw.externalId || raw.id || null;
      const url = raw.url || raw.source || null;

      try {
        if (externalId) {
          await prisma.learnSource.upsert({
            where: { externalId: String(externalId) },
            create: {
              type: "cedance",
              prompt,
              title,
              url,
              blobUrl: videoUrl,
              thumbnail,
              externalId: String(externalId),
              status: "complete",
              addedBy: "json-import",
            },
            update: { prompt, title, blobUrl: videoUrl, thumbnail, url },
          });
          upserted++;
        } else {
          await prisma.learnSource.create({
            data: {
              type: "cedance",
              prompt,
              title,
              url,
              blobUrl: videoUrl,
              thumbnail,
              status: "complete",
              addedBy: "json-import",
            },
          });
          created++;
        }
      } catch (e: any) {
        errors.push(String(e.message || e).slice(0, 200));
      }
    }

    return { ok: true as const, received: items.length, created, upserted, errors };
  } catch (e: any) {
    return { ok: false as const, error: `JSON parse: ${e.message}` };
  }
}

// --- Paste CSV (title,prompt[,videoUrl][,thumbnail]) ---
export async function runCsvImportAction(rawCsv: string) {
  try {
    const lines = rawCsv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { ok: false as const, error: "CSV ריק" };

    // Parse header: expect at minimum title + prompt
    const headerRow = parseCsvLine(lines[0]);
    const idx = {
      title: headerRow.findIndex((h) => /^title|name$/i.test(h)),
      prompt: headerRow.findIndex((h) => /^prompt|text$/i.test(h)),
      videoUrl: headerRow.findIndex((h) => /^video|videourl|url_video$/i.test(h)),
      thumbnail: headerRow.findIndex((h) => /^thumbnail|image$/i.test(h)),
      externalId: headerRow.findIndex((h) => /^externalid|id$/i.test(h)),
    };
    if (idx.prompt === -1) return { ok: false as const, error: "CSV חייב עמודת 'prompt'" };

    let created = 0;
    let upserted = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const prompt = (row[idx.prompt] || "").trim();
      if (prompt.length < 10) continue;

      const title = idx.title >= 0 ? row[idx.title] || null : null;
      const videoUrl = idx.videoUrl >= 0 ? row[idx.videoUrl] || null : null;
      const thumbnail = idx.thumbnail >= 0 ? row[idx.thumbnail] || null : null;
      const externalId = idx.externalId >= 0 ? row[idx.externalId] || null : null;

      try {
        if (externalId) {
          await prisma.learnSource.upsert({
            where: { externalId },
            create: {
              type: "cedance",
              prompt,
              title,
              blobUrl: videoUrl,
              thumbnail,
              externalId,
              status: "complete",
              addedBy: "csv-import",
            },
            update: { prompt, title, blobUrl: videoUrl, thumbnail },
          });
          upserted++;
        } else {
          await prisma.learnSource.create({
            data: {
              type: "cedance",
              prompt,
              title,
              blobUrl: videoUrl,
              thumbnail,
              status: "complete",
              addedBy: "csv-import",
            },
          });
          created++;
        }
      } catch (e: any) {
        errors.push(String(e.message || e).slice(0, 200));
      }
    }
    return { ok: true as const, received: lines.length - 1, created, upserted, errors };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e) };
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
