import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { scrapeGuideFromUrl } from "@/lib/learn/guide-scraper";
import { translateGuideToLang } from "@/lib/learn/translate";
import { GUIDE_CATALOG, type CatalogKey } from "@/lib/learn/guide-catalog";
import { createJob, updateJob, finishJob, failJob } from "@/lib/learn/sync-jobs";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const HE_TO_LAT: Record<string, string> = { א:"a",ב:"b",ג:"g",ד:"d",ה:"h",ו:"v",ז:"z",ח:"ch",ט:"t",י:"y",כ:"k",ך:"k",ל:"l",מ:"m",ם:"m",נ:"n",ן:"n",ס:"s",ע:"a",פ:"p",ף:"p",צ:"tz",ץ:"tz",ק:"k",ר:"r",ש:"sh",ת:"t" };
function slugify(text: string): string {
  return text.split("").map((c) => HE_TO_LAT[c] ?? c).join("").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) || "guide";
}

async function importOne(url: string, category: string): Promise<{ ok: boolean; slug?: string; error?: string }> {
  try {
    const scraped = await scrapeGuideFromUrl(url);
    if (!scraped.title || scraped.title.length < 3) return { ok: false, error: "no-title" };
    const slug = `${slugify(scraped.title)}-${Date.now().toString(36).slice(-4)}`;
    const guide = await prisma.guide.create({
      data: {
        slug,
        defaultLang: "en",
        status: "draft",
        isPublic: true,
        source: "url-import",
        sourceUrl: url,
        coverImageUrl: scraped.coverImageUrl,
        category,
        translations: { create: { lang: "en", title: scraped.title, description: scraped.description, isAuto: false } },
        stages: scraped.stages.length > 0 ? {
          create: scraped.stages.slice(0, 20).map((s, i) => ({
            order: i,
            type: i === 0 ? "start" : i === Math.min(scraped.stages.length, 20) - 1 ? "end" : "middle",
            transitionToNext: "fade",
            translations: { create: { lang: "en", title: s.title, content: s.content, isAuto: false } },
            images: s.images.length > 0 ? { create: s.images.slice(0, 5).map((imgUrl, idx) => ({ blobUrl: imgUrl, source: "url-scrape", order: idx })) } : undefined,
          })),
        } : undefined,
      },
    });
    waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
    return { ok: true, slug: guide.slug };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 120) };
  }
}

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const { catalog } = await req.json().catch(() => ({ catalog: "all" }));

  const allUrls: Array<{ url: string; category: string }> = [];
  const keys: CatalogKey[] = catalog === "all" ? (Object.keys(GUIDE_CATALOG) as CatalogKey[]) : [catalog as CatalogKey];
  for (const k of keys) {
    if (!GUIDE_CATALOG[k]) continue;
    for (const url of GUIDE_CATALOG[k]) allUrls.push({ url, category: k });
  }

  const jobId = await createJob("bulk-catalog-import", allUrls.length);

  waitUntil((async () => {
    let ok = 0, fail = 0;
    for (let i = 0; i < allUrls.length; i++) {
      const { url, category } = allUrls[i];
      await updateJob(jobId, { completedItems: i, currentMessage: `${i + 1}/${allUrls.length}: ${url.slice(0, 60)}` });
      const r = await importOne(url, category);
      if (r.ok) ok++; else fail++;
    }
    await finishJob(jobId, { ok, fail, total: allUrls.length });
  })().catch((e) => failJob(jobId, String(e?.message || e))));

  return NextResponse.json({ ok: true, jobId, total: allUrls.length });
}
