import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { translateGuideToLang } from "@/lib/learn/translate";
import { createJob, finishJob, failJob, updateJob } from "@/lib/learn/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  // Find all guides that don't have a Hebrew translation yet
  const guides = await prisma.guide.findMany({
    select: { id: true, slug: true, defaultLang: true, translations: { select: { lang: true } } },
  });
  const needsTranslate = guides.filter((g) => !g.translations.some((t) => t.lang === "he"));

  const jobId = await createJob("translate-library-to-hebrew", needsTranslate.length, "מתחיל…");

  if (needsTranslate.length === 0) {
    await finishJob(jobId, { translated: 0, message: "All guides already have Hebrew" });
    return NextResponse.json({ ok: true, jobId, total: 0 });
  }

  waitUntil(
    (async () => {
      try {
        let i = 0;
        for (const g of needsTranslate) {
          i++;
          await updateJob(jobId, {
            completedItems: i - 1,
            currentStep: "Gemini מתרגם לעברית",
            currentMessage: `${i}/${needsTranslate.length}: ${g.slug.slice(0, 40)}`,
          });
          try {
            await translateGuideToLang(g.id, "he");
          } catch (e: any) {
            console.warn("[bulk-translate] failed", g.slug, e?.message);
          }
        }
        await finishJob(jobId, { translated: needsTranslate.length });
      } catch (e: any) {
        await failJob(jobId, String(e?.message || e).slice(0, 500));
      }
    })(),
  );

  return NextResponse.json({ ok: true, jobId, total: needsTranslate.length });
}
