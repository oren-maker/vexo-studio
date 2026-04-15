import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { rateScene } from "@/lib/learn/scene-rating";
import { createJob, finishJob, failJob, updateJob } from "@/lib/learn/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const session = await prisma.trimSession.findUnique({
    where: { id: params.id },
    include: { scenes: { orderBy: { order: "asc" } } },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const scenesToRate = session.scenes.filter((s) => !s.aiRating && s.thumbnailUrl);
  if (scenesToRate.length === 0) {
    return NextResponse.json({ ok: true, jobId: null, message: "all scenes already rated or no thumbnails" });
  }

  const jobId = await createJob("scene-rating", scenesToRate.length, "מתחיל…");

  waitUntil(
    (async () => {
      try {
        await prisma.trimSession.update({ where: { id: session.id }, data: { status: "rating" } });
        let i = 0;
        for (const scene of scenesToRate) {
          i++;
          await updateJob(jobId, {
            completedItems: i - 1,
            currentStep: "Gemini מדרג סצנות",
            currentMessage: `${i}/${scenesToRate.length}`,
          });
          try {
            const r = await rateScene(scene.thumbnailUrl!);
            await prisma.trimScene.update({
              where: { id: scene.id },
              data: { aiRating: r.rating, aiReason: r.reason, selected: r.rating >= 5 },
            });
          } catch (e: any) {
            console.warn("[scene-rating] failed for", scene.id, e?.message);
          }
        }
        await prisma.trimSession.update({ where: { id: session.id }, data: { status: "ready" } });
        await finishJob(jobId, { ratedCount: scenesToRate.length });
      } catch (e: any) {
        await failJob(jobId, String(e?.message || e).slice(0, 500));
      }
    })(),
  );

  return NextResponse.json({ ok: true, jobId });
}
