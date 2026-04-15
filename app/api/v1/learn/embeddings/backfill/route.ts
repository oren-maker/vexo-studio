import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { embedText } from "@/lib/learn/gemini-embeddings";
import { createJob, finishJob, failJob, updateJob } from "@/lib/learn/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "gemini-embedding-001";

// Body: { force?: boolean } — if true, re-embed even sources that already have an embedding
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const body = await req.json().catch(() => ({}));
  const force = !!body.force;

  const sources = await prisma.learnSource.findMany({
    where: force ? { status: "complete" } : { status: "complete", embeddedAt: null },
    select: { id: true, title: true, prompt: true },
    take: 1000,
  });

  const jobId = await createJob("embeddings-backfill", sources.length, "מאתחל…");

  waitUntil(
    (async () => {
      try {
        let i = 0;
        for (const s of sources) {
          i++;
          await updateJob(jobId, {
            completedItems: i - 1,
            currentStep: "מחשב embeddings",
            currentMessage: `${i}/${sources.length}: ${(s.title || s.prompt.slice(0, 40)).slice(0, 60)}`,
          });
          try {
            const text = `${s.title || ""}\n\n${s.prompt}`.trim();
            const vec = await embedText(text);
            await prisma.learnSource.update({
              where: { id: s.id },
              data: { embedding: vec, embeddingModel: MODEL, embeddedAt: new Date() },
            });
          } catch (e: any) {
            console.warn(`[embed] failed for ${s.id}:`, e?.message);
          }
        }
        await finishJob(jobId, { embedded: i });
      } catch (e: any) {
        await failJob(jobId, String(e?.message || e).slice(0, 500));
      }
    })(),
  );

  return NextResponse.json({ ok: true, jobId, totalSources: sources.length });
}
