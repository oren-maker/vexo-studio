import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import { isValidLang, DEFAULT_LANG, isRtl } from "@/lib/learn/guide-languages";
import LanguagePicker from "@/components/learn/guides/language-picker";
import GuideStarRating from "@/components/learn/guides/guide-star-rating";
import TranslateLibraryButton from "@/components/learn/guides/translate-library-button";
import MemoryTabs from "@/components/learn/memory-tabs";

export const dynamic = "force-dynamic";

export default async function GuidesLibraryPage({ searchParams }: { searchParams: { lang?: string; category?: string } }) {
  const lang = isValidLang(searchParams.lang || "") ? (searchParams.lang as string) : DEFAULT_LANG;
  const category = searchParams.category || undefined;

  const [guides, allGuides, totalStages, bySource] = await Promise.all([
    prisma.guide.findMany({
      where: { status: { in: ["draft", "published"] }, ...(category ? { category } : {}) },
      select: {
        id: true, slug: true, defaultLang: true, coverImageUrl: true,
        category: true, estimatedMinutes: true, userRating: true,
        translations: { select: { lang: true, title: true, description: true, isAuto: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.guide.findMany({
      where: { status: { in: ["draft", "published"] } },
      select: { status: true, coverImageUrl: true, viewCount: true, userRating: true, category: true, source: true, estimatedMinutes: true },
    }),
    prisma.guideStage.count(),
    prisma.guide.groupBy({ by: ["source"], _count: { _all: true }, orderBy: { _count: { source: "desc" } } }),
  ]);

  const totalGuides = allGuides.length;
  const publishedCount = allGuides.filter((g) => g.status === "published").length;
  const withCover = allGuides.filter((g) => !!g.coverImageUrl).length;
  const totalViews = allGuides.reduce((a, g) => a + (g.viewCount || 0), 0);
  const ratedGuides = allGuides.filter((g) => (g.userRating ?? 0) > 0);
  const avgRating = ratedGuides.length ? (ratedGuides.reduce((a, g) => a + (g.userRating || 0), 0) / ratedGuides.length) : 0;
  const totalMinutes = allGuides.reduce((a, g) => a + (g.estimatedMinutes || 0), 0);

  const categories = Array.from(new Set(guides.map((g) => g.category).filter(Boolean))) as string[];
  const categoryCount: Record<string, number> = {};
  for (const g of allGuides) if (g.category) categoryCount[g.category] = (categoryCount[g.category] || 0) + 1;

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">🧠 זיכרון</h1>
          <p className="text-sm text-slate-400 mt-1">כל מה שהבמאי יודע — פרומפטים שנותחו ומדריכים מובנים.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LanguagePicker current={lang} />
          <TranslateLibraryButton />
          <Link href="/learn/guides/enrich" className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 font-semibold px-4 py-2 rounded-lg text-sm">
            ✨ העשר הכל עם Gemini
          </Link>
          <Link href="/learn/guides/new" className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm">
            ➕ מדריך חדש
          </Link>
        </div>
      </header>

      <MemoryTabs active="guides" />

      {/* Dashboard stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard value={totalGuides} label="מדריכים במאגר" accent="white" hint={`${publishedCount} פורסמו · ${totalGuides - publishedCount} טיוטה`} />
        <StatCard value={totalStages} label="שלבים כוללים" accent="cyan" hint={totalGuides > 0 ? `ממוצע ${(totalStages / totalGuides).toFixed(1)} לשלב` : "—"} />
        <StatCard value={withCover} label="עם תמונת שער" accent="purple" hint={`${Math.round((withCover / Math.max(totalGuides, 1)) * 100)}% מהמדריכים`} />
        <StatCard value={totalViews.toLocaleString()} label="צפיות סה״כ" accent="emerald" hint={totalGuides > 0 ? `ממוצע ${Math.round(totalViews / totalGuides)} למדריך` : "—"} />
        <StatCard value={avgRating > 0 ? avgRating.toFixed(1) : "—"} label="דירוג ממוצע" accent="amber" hint={ratedGuides.length > 0 ? `${ratedGuides.length} מדריכים דורגו` : "טרם דורגו"} />
      </div>

      {/* Source + minutes breakdown */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 mb-6 text-xs flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500">מקור:</span>
          {bySource.map((s) => (
            <span key={s.source ?? "—"} className="bg-slate-800/60 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">
              {prettySource(s.source)} <span className="text-slate-500">· {s._count._all}</span>
            </span>
          ))}
        </div>
        <div className="text-slate-400">⏱ סה״כ זמן קריאה משוער: {totalMinutes.toLocaleString()} דק׳</div>
      </div>

      {categories.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap text-xs">
          <span className="text-slate-500">קטגוריות:</span>
          <Link href={`/learn/guides?lang=${lang}`} className={`px-3 py-1 rounded-full border ${!category ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}>
            הכל ({totalGuides})
          </Link>
          {categories.map((c) => (
            <Link key={c} href={`/learn/guides?lang=${lang}&category=${encodeURIComponent(c)}`} className={`px-3 py-1 rounded-full border ${category === c ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}>
              {c} <span className="opacity-60">({categoryCount[c] || 0})</span>
            </Link>
          ))}
        </div>
      )}

      {guides.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
          <div className="text-5xl mb-3">📖</div>
          <h2 className="text-lg font-semibold text-white mb-1">אין עדיין מדריכים</h2>
          <p className="text-sm text-slate-400 mb-4">צור את הראשון</p>
          <Link href="/learn/guides/new" className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2 rounded-lg text-sm">
            ➕ מדריך חדש
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {guides.map((g) => {
            // Hebrew-first display strategy
            const heTrans = g.translations.find((x) => x.lang === "he");
            const reqTrans = g.translations.find((x) => x.lang === lang);
            const defaultTrans = g.translations.find((x) => x.lang === g.defaultLang);
            const t = heTrans || reqTrans || defaultTrans || g.translations[0];
            const isShowingHebrew = t?.lang === "he";
            const dir = isRtl(t?.lang || g.defaultLang) ? "rtl" : "ltr";
            return (
              <Link
                key={g.id}
                href={`/learn/guides/${g.slug}?lang=${isShowingHebrew ? "he" : lang}`}
                className="bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 rounded-xl overflow-hidden transition group block"
                dir={dir}
              >
                <div className="aspect-video bg-slate-800 overflow-hidden">
                  {g.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.coverImageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-5xl text-slate-700">📖</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1 text-[10px] flex-wrap">
                    {g.category && <span className="bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">{g.category}</span>}
                    {g.estimatedMinutes && <span className="text-slate-500">⏱ {g.estimatedMinutes} דק׳</span>}
                    {!isShowingHebrew && (
                      <span className="bg-amber-500/15 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded">
                        🌐 לא תורגם לעברית
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-white line-clamp-2 mb-1">{t?.title || "(ללא כותרת)"}</h3>
                  {t?.description && <p className="text-xs text-slate-400 line-clamp-2 mb-2">{t.description}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <GuideStarRating slug={g.slug} initialRating={g.userRating} size="sm" />
                    {t?.isAuto && <span className="text-[9px] text-amber-400">🤖 תרגום AI</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, accent, hint }: { value: number | string; label: string; accent: "white" | "cyan" | "purple" | "emerald" | "amber"; hint?: string }) {
  const colorMap = {
    white: "text-white",
    cyan: "text-cyan-300",
    purple: "text-purple-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`text-3xl font-black ${colorMap[accent]}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-sm text-slate-300 mt-1">{label}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function prettySource(raw: string | null): string {
  if (!raw) return "ללא מקור";
  const map: Record<string, string> = {
    "claude-school-import": "📥 Claude School",
    "ai-generated": "✨ AI Generated",
    "url-import": "🌐 URL import",
    "instagram": "📸 Instagram",
    "authored": "✍️ נכתב ידנית",
    "upload": "📤 העלאה",
  };
  return map[raw] || raw;
}
