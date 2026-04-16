#!/usr/bin/env node
/**
 * One-shot data migration: copy every row from the 26 vexo-learn tables that
 * live in the OLD vexo-learn DB into the corresponding tables in the
 * vexo-studio DB. Skips rows whose primary key already exists (idempotent).
 *
 * Usage:
 *   LEARN_DATABASE_URL="postgres://..." STUDIO_DATABASE_URL="postgres://..." \
 *     node scripts/migrate-learn-data.mjs
 *
 * Order matters — parents before children (foreign keys).
 */
import { PrismaClient } from "@prisma/client";

const LEARN_URL  = process.env.LEARN_DATABASE_URL;
const STUDIO_URL = process.env.STUDIO_DATABASE_URL;
if (!LEARN_URL || !STUDIO_URL) {
  console.error("Set LEARN_DATABASE_URL and STUDIO_DATABASE_URL");
  process.exit(1);
}

const learn  = new PrismaClient({ datasources: { db: { url: LEARN_URL  } } });
const studio = new PrismaClient({ datasources: { db: { url: STUDIO_URL } } });

// Order: parents first. Children with FKs come after their parents.
const TABLES = [
  // Standalone
  "learnSource",
  "subscriberPrompt",
  "syncJob",
  "improvementRun",
  "apiUsage",
  "knowledgeNode",
  "insightsSnapshot",
  "dailyBrainCache",
  "brainUpgradeRequest",
  // Chat
  "brainChat",
  "brainMessage",        // FK -> brainChat
  // Source-children
  "videoAnalysis",       // FK -> learnSource
  "promptVersion",       // FK -> learnSource
  "generatedImage",      // FK -> learnSource
  "generatedVideo",      // FK -> learnSource
  // Guides
  "guide",
  "guideStage",          // FK -> guide
  "guideTranslation",    // FK -> guide
  "guideStageTranslation", // FK -> guideStage
  "guideStageImage",     // FK -> guideStage
  // Merge
  "mergeJob",
  "mergeClip",           // FK -> mergeJob
  "mergeTransition",     // FK -> mergeJob
  "mergeEdit",           // FK -> mergeJob
  // Trim
  "trimSession",
  "trimScene",           // FK -> trimSession
];

let total = 0;
for (const t of TABLES) {
  try {
    const rows = await learn[t].findMany();
    if (rows.length === 0) { console.log(`${t}: 0 rows (skip)`); continue; }
    let inserted = 0, skipped = 0;
    for (const row of rows) {
      try {
        await studio[t].create({ data: row });
        inserted++;
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (/Unique constraint|already exists|P2002/i.test(msg)) skipped++;
        else { console.warn(`  ${t}#${row.id ?? "?"} insert failed: ${msg.slice(0, 120)}`); skipped++; }
      }
    }
    console.log(`${t}: ${inserted} inserted, ${skipped} skipped (existed) of ${rows.length}`);
    total += inserted;
  } catch (e) {
    console.error(`${t}: FAILED — ${e.message.slice(0, 200)}`);
  }
}

await learn.$disconnect();
await studio.$disconnect();
console.log(`\nDONE — ${total} new rows inserted into vexo-studio DB`);
