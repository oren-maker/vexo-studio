import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function LearnFeed({ searchParams }: { searchParams: { page?: string } }) {
  const page = Math.max(1, Number(searchParams.page || 1));
  const skip = (page - 1) * PAGE_SIZE;

  const [sources, completeCount, totals] = await Promise.all([
    prisma.learnSource.findMany({
      where: { status: "complete" },
      include: { analysis: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.learnSource.count({ where: { status: "complete" } }),
    prisma.learnSource.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const totalByStatus = Object.fromEntries(totals.map((t) => [t.status, t._count.status]));
  const totalPages = Math.max(1, Math.ceil(completeCount / PAGE_SIZE));

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">Feed · למידה</h1>
        <p className="text-sm text-slate-400 mt-1">
          כל הסרטונים שנותחו על ידי Gemini וההמלצות שנוצרו מהם.
        </p>
        <div className="flex gap-2 mt-4 text-xs flex-wrap">
          <span className="bg-emerald-500/10 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/20">
            ✅ הושלמו: {totalByStatus.complete || 0}
          </span>
          <span className="bg-amber-500/10 text-amber-300 px-3 py-1 rounded-full border border-amber-500/20">
            ⚙️ מעבד: {totalByStatus.processing || 0}
          </span>
          <span className="bg-slate-700/40 text-slate-300 px-3 py-1 rounded-full">
            ⏳ ממתין: {totalByStatus.pending || 0}
          </span>
          {totalByStatus.failed ? (
            <span className="bg-red-500/10 text-red-300 px-3 py-1 rounded-full border border-red-500/20">
              ❌ נכשלו: {totalByStatus.failed}
            </span>
          ) : null}
        </div>
      </header>

      {sources.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">🎬</div>
          <h2 className="text-lg font-semibold text-white mb-1">ה-feed ריק</h2>
          <p className="text-sm text-slate-400 mb-5">הוסף סרטון ראשון לניתוח או חפש ב-Pexels.</p>
          <div className="flex gap-2 justify-center">
            <Link
              href="/learn/sources/new"
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2 rounded-lg text-sm"
            >
              ➕ הוסף URL
            </Link>
            <Link
              href="/learn/search"
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 px-5 py-2 rounded-lg text-sm"
            >
              🔍 חיפוש Pexels
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map((s) => {
              const tags = s.analysis?.tags || [];
              return (
                <Link
                  key={s.id}
                  href={`/learn/sources/${s.id}`}
                  className="group bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden hover:border-cyan-500/50 transition"
                >
                  <div className="aspect-video bg-slate-800 relative overflow-hidden">
                    {s.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.thumbnail} alt={s.title || ""} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-4xl text-slate-700">🎬</div>
                    )}
                    {s.analysis?.difficulty && (
                      <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase bg-slate-950/80 text-cyan-300 px-2 py-0.5 rounded">
                        {s.analysis.difficulty}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-semibold text-white mb-1 line-clamp-2">
                      {s.title || s.prompt.slice(0, 80)}
                    </div>
                    {s.analysis?.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                        {s.analysis.description}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tags.slice(0, 4).map((t) => (
                          <span key={t} className="text-[10px] bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/20">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} total={completeCount} pageSize={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, total, pageSize }: { page: number; totalPages: number; total: number; pageSize: number }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  function url(p: number) {
    return p > 1 ? `/learn?page=${p}` : "/learn";
  }
  // page numbers: 1, last, current±2
  const candidates = [1, totalPages, page, page - 1, page + 1, page - 2, page + 2];
  const seen = new Set<number>();
  const visible: number[] = [];
  for (const p of candidates) {
    if (p >= 1 && p <= totalPages && !seen.has(p)) { seen.add(p); visible.push(p); }
  }
  visible.sort((a, b) => a - b);

  return (
    <div className="mt-8 flex items-center justify-between flex-wrap gap-3 bg-slate-900/40 border border-slate-800 rounded-xl p-4">
      <div className="text-xs text-slate-400">
        מציג {from}–{to} מתוך {total.toLocaleString()}
      </div>
      <div className="flex items-center gap-1" dir="ltr">
        <PageLink href={page > 1 ? url(page - 1) : null} label="‹ הקודם" />
        {visible.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p > visible[i - 1] + 1 && <span className="text-slate-600 px-1">…</span>}
            {p === page ? (
              <span className="bg-cyan-500 text-slate-950 font-bold px-3 py-1 rounded text-xs">{p}</span>
            ) : (
              <Link href={url(p)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded text-xs">{p}</Link>
            )}
          </span>
        ))}
        <PageLink href={page < totalPages ? url(page + 1) : null} label="הבא ›" />
      </div>
    </div>
  );
}

function PageLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-slate-600 px-2 py-1 text-xs cursor-not-allowed">{label}</span>;
  return <Link href={href} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs">{label}</Link>;
}
