import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";
import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { isValidLang, DEFAULT_LANG, isRtl } from "@/lib/learn/guide-languages";
import LanguagePicker from "@/components/learn/guides/language-picker";
import StageRenderer from "@/components/learn/guides/stage-renderer";
import ShareButton from "@/components/learn/guides/share-button";
import GuideStarRating from "@/components/learn/guides/guide-star-rating";

export const dynamic = "force-dynamic";

async function fetchGuide(slug: string, lang: string, host: string, proto: string) {
  // Use absolute URL on server, since fetch doesn't resolve relative paths server-side
  const res = await fetch(`${proto}://${host}/api/guides/${slug}?lang=${lang}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
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

  return (
    <div className="max-w-4xl mx-auto" dir={dir}>
      <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
        <Link href="/guides" className="text-xs text-slate-400 hover:text-cyan-400">
          ← חזרה לספריה
        </Link>
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
            href={`/guides/${guide.slug}/edit`}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded"
          >
            ✏️ ערוך
          </Link>
        </div>
      </div>

      <header className="mb-6">
        {guide.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guide.coverImageUrl} alt="" className="w-full aspect-video object-cover rounded-xl border border-slate-800 mb-4" />
        )}
        <h1 className="text-3xl font-bold text-white">{trans?.title || "(ללא כותרת)"}</h1>
        {trans?.description && <p className="text-base text-slate-300 mt-2">{trans.description}</p>}
        <div className="mt-3">
          <GuideStarRating slug={guide.slug} initialRating={guide.userRating} size="lg" />
        </div>
        <div className="flex gap-3 items-center text-xs text-slate-500 mt-3 flex-wrap">
          {guide.category && <span className="bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">{guide.category}</span>}
          {guide.authorName && <span>✍️ {guide.authorName}</span>}
          {guide.estimatedMinutes && <span>⏱ {guide.estimatedMinutes} דק׳ קריאה</span>}
          <span className="bg-slate-800/60 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">👁 {(guide.viewCount || 0).toLocaleString()} צפיות</span>
          {trans?.isAuto && <span className="text-amber-400">🤖 תרגום AI</span>}
          <span>{guide.stages.length} שלבים</span>
        </div>
      </header>

      {guide.stages.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
          <p className="text-slate-400">למדריך הזה אין שלבים עדיין.</p>
          <Link href={`/guides/${guide.slug}/edit`} className="text-cyan-400 underline mt-3 inline-block">פתח עורך ←</Link>
        </div>
      ) : (
        <div className="space-y-8">
          {guide.stages.map((stage: any, i: number) => {
            const stageTrans = stage.translations.find((t: any) => t.lang === lang) || stage.translations.find((t: any) => t.lang === guide.defaultLang) || stage.translations[0];
            return (
              <StageRenderer
                key={stage.id}
                index={i}
                total={guide.stages.length}
                title={stageTrans?.title || ""}
                content={stageTrans?.content || ""}
                images={stage.images}
                type={stage.type}
                transitionToNext={stage.transitionToNext}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
