import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { isValidLang, DEFAULT_LANG, isRtl } from "@/lib/learn/guide-languages";
import LanguagePicker from "@/components/learn/guides/language-picker";
import StageRenderer from "@/components/learn/guides/stage-renderer";
import ShareButton from "@/components/learn/guides/share-button";
import GuideStarRating from "@/components/learn/guides/guide-star-rating";
import GuideToc from "@/components/learn/guides/guide-toc";

export const dynamic = "force-dynamic";

async function fetchGuide(slug: string, lang: string, host: string, proto: string) {
  const res = await fetch(`${proto}://${host}/api/v1/learn/guides/${slug}?lang=${lang}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function slugAnchor(text: string, fallback: string): string {
  const s = (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return s || fallback;
}

export default async function GuideViewPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { lang?: string };
}) {
  const lang = isValidLang(searchParams.lang || "") ? (searchParams.lang as string) : DEFAULT_LANG;
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";

  const data = await fetchGuide(params.slug, lang, host, proto);
  if (!data?.guide) notFound();

  const guide = data.guide;
  const { prisma } = await import("@/lib/learn/db");
  prisma.guide.update({ where: { slug: guide.slug }, data: { viewCount: { increment: 1 } } }).catch(() => {});
  const trans = guide.translations.find((t: any) => t.lang === lang) || guide.translations.find((t: any) => t.lang === guide.defaultLang) || guide.translations[0];
  const dir = isRtl(lang) ? "rtl" : "ltr";

  const stagesWithAnchors = guide.stages.map((s: any, i: number) => {
    const stageTrans = s.translations.find((t: any) => t.lang === lang) || s.translations.find((t: any) => t.lang === guide.defaultLang) || s.translations[0];
    return { stage: s, trans: stageTrans, anchorId: slugAnchor(stageTrans?.title || "", `section-${i + 1}`) };
  });
  const tocItems = stagesWithAnchors.map((x: any) => ({ id: x.anchorId, title: x.trans?.title || `שלב ${x.stage.order + 1}` }));

  const created = guide.createdAt ? new Date(guide.createdAt) : null;
  const createdStr = created ? created.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <div className="max-w-7xl mx-auto" dir={dir}>
      {/* Top breadcrumb / back links */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-3">
          <Link href="/learn/guides" className="text-slate-400 hover:text-cyan-400">
            ← חזרה לזיכרון
          </Link>
          <span className="text-slate-700">|</span>
          <Link href="/learn/guides" className="text-slate-400 hover:text-cyan-400">
            כל המדריכים
          </Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LanguagePicker current={lang} size="sm" />
          <ShareButton slug={guide.slug} title={trans?.title || ""} />
          <a
            href={`/api/v1/learn/guides/${guide.slug}/pdf?lang=${lang}`}
            target="_blank"
            className="text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded"
          >
            📥 PDF
          </a>
          <Link
            href={`/learn/guides/${guide.slug}/edit`}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded"
          >
            ✏️ ערוך
          </Link>
        </div>
      </div>

      {/* 2-col: TOC + main */}
      <div className="flex gap-8">
        <GuideToc items={tocItems} />

        <article className="flex-1 min-w-0 max-w-3xl">
          {/* Category pill */}
          {guide.category && (
            <div className="mb-4">
              <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-semibold">
                💬 {guide.category}
              </span>
            </div>
          )}

          {/* Cover */}
          {guide.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guide.coverImageUrl} alt="" className="w-full aspect-video object-cover rounded-xl border border-slate-800 mb-6" />
          )}

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">{trans?.title || "(ללא כותרת)"}</h1>

          {/* Subtitle / description */}
          {trans?.description && <p className="text-base md:text-lg text-slate-300 mt-4 leading-relaxed">{trans.description}</p>}

          {/* Metadata strip */}
          <div className="flex items-center gap-4 text-xs text-slate-400 mt-5 flex-wrap">
            {guide.authorName && <span className="flex items-center gap-1">👤 {guide.authorName}</span>}
            {createdStr && <span className="flex items-center gap-1">📅 {createdStr}</span>}
            {guide.estimatedMinutes && <span className="flex items-center gap-1">⏱ {guide.estimatedMinutes} דק׳ קריאה</span>}
            <span className="flex items-center gap-1">👁 {(guide.viewCount || 0).toLocaleString()} צפיות</span>
            <span className="flex items-center gap-1">📑 {guide.stages.length} שלבים</span>
          </div>

          {/* Rating */}
          <div className="mt-4">
            <GuideStarRating slug={guide.slug} initialRating={guide.userRating} size="lg" />
          </div>

          {/* Divider */}
          <hr className="border-slate-800 my-8" />

          {/* Stages */}
          {guide.stages.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
              <p className="text-slate-400">למדריך הזה אין שלבים עדיין.</p>
              <Link href={`/learn/guides/${guide.slug}/edit`} className="text-cyan-400 underline mt-3 inline-block">פתח עורך ←</Link>
            </div>
          ) : (
            <div className="space-y-10">
              {stagesWithAnchors.map((x: any, i: number) => (
                <StageRenderer
                  key={x.stage.id}
                  index={i}
                  total={guide.stages.length}
                  title={x.trans?.title || ""}
                  content={x.trans?.content || ""}
                  images={x.stage.images}
                  type={x.stage.type}
                  transitionToNext={x.stage.transitionToNext}
                  anchorId={x.anchorId}
                />
              ))}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
