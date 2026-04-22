// Live progress watcher for the most recent season opening that's in-flight.
// Polls OpenAI Sora (or Google VEO) directly every 15s and prints a compact
// status line. Run locally while a generation is happening:
//
//   DATABASE_URL=... OPENAI_API_KEY=... GEMINI_API_KEY=... \
//     npx tsx scripts/watch-opening.ts [seasonId]
//
// If no seasonId is provided, watches whichever opening most recently had its
// status set to GENERATING (or whose falRequestId was updated). Stops
// automatically when the job reports completed / failed / 10 min timeout.

import { prisma } from "../lib/learn/db";
import { pollSoraVideo } from "../lib/providers/openai-sora";
import { pollVeoOperation } from "../lib/providers/google-veo";

const POLL_SEC = 15;
const MAX_MIN = 10;

function fmtTime(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

async function pickOpening(arg?: string) {
  if (arg) {
    return await prisma.seasonOpening.findFirst({
      where: { OR: [{ id: arg }, { seasonId: arg }] },
    });
  }
  // most recent opening that's mid-flight (falRequestId set, not READY)
  const inFlight = await prisma.seasonOpening.findFirst({
    where: { falRequestId: { not: null }, status: { notIn: ["READY"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (inFlight) return inFlight;
  // fallback — most recent opening of any kind
  return await prisma.seasonOpening.findFirst({ orderBy: { updatedAt: "desc" } });
}

async function main() {
  const arg = process.argv[2];
  const opening = await pickOpening(arg);
  if (!opening) {
    console.log("no opening found");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nwatching opening ${opening.id.slice(-8)} (season ${opening.seasonId.slice(-8)})`);
  console.log(`  model=${opening.model}  provider=${opening.provider}  status=${opening.status}`);
  console.log(`  falRequestId=${opening.falRequestId ?? "(none)"}`);
  console.log(`  started polling — ${POLL_SEC}s interval, ${MAX_MIN}min max\n`);

  if (!opening.falRequestId) {
    console.log("opening has no in-flight job (no falRequestId). nothing to watch.");
    await prisma.$disconnect();
    return;
  }

  const t0 = Date.now();
  let lastStatus = "";
  let lastProgress = -1;

  while (Date.now() - t0 < MAX_MIN * 60 * 1000) {
    const elapsed = Date.now() - t0;
    let statusLine = "";
    try {
      if (opening.provider === "openai") {
        const r = await pollSoraVideo(opening.falRequestId);
        statusLine = `status=${r.status} progress=${r.progress ?? "?"}%`;
        if (r.error) statusLine += ` error=${JSON.stringify(r.error).slice(0, 120)}`;
        if (r.status !== lastStatus || (r.progress ?? -1) !== lastProgress) {
          console.log(`[${fmtTime(elapsed).padStart(6)}] ${statusLine}`);
          lastStatus = r.status;
          lastProgress = r.progress ?? -1;
        }
        if (r.status === "completed" || r.status === "failed") {
          console.log(`\n${r.status === "completed" ? "✅" : "❌"} terminal: ${statusLine}`);
          break;
        }
      } else if (opening.provider === "google") {
        const r = await pollVeoOperation(opening.falRequestId);
        statusLine = `done=${r.done} ${r.videoUri ? "videoUri=present" : ""} ${r.error ? `error=${r.error}` : ""}`;
        if (statusLine !== lastStatus) {
          console.log(`[${fmtTime(elapsed).padStart(6)}] ${statusLine}`);
          lastStatus = statusLine;
        }
        if (r.done) {
          console.log(`\n${r.videoUri ? "✅" : "❌"} terminal: ${statusLine}`);
          break;
        }
      } else {
        console.log("unsupported provider for direct polling:", opening.provider);
        break;
      }
    } catch (e: any) {
      console.log(`[${fmtTime(elapsed).padStart(6)}] poll error: ${e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, POLL_SEC * 1000));
  }

  // Final DB snapshot
  const after = await prisma.seasonOpening.findUnique({ where: { id: opening.id } });
  console.log(`\nDB now: status=${after?.status} videoUrl=${after?.videoUrl?.slice(0, 80) ?? "(none)"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
