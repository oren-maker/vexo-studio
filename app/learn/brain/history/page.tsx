import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

export default async function BrainHistoryPage() {
  const caches = await prisma.dailyBrainCache.findMany({
    orderBy: { date: "desc" },
    take: 90,
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <Link href="/learn/brain" className="text-xs text-slate-400 hover:text-cyan-400">
          ← חזרה למוח
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">📜 לוגי המוח</h1>
        <p className="text-sm text-slate-400 mt-1">
          כל הזהויות היומיות שנשמרו ב-{caches.length} ימים האחרונים. לחץ על כל יום כדי לראות את הזהות המלאה, learnings, ו-tomorrow focus.
        </p>
      </header>

      {caches.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
          <p className="text-slate-400">אין עדיין caches. חזור ל-/learn/brain ולחץ &quot;🔄 רענן זהות&quot;.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {caches.map((c, i) => {
            const prev = caches[i + 1];
            const promptsDelta = prev ? c.totalPrompts - prev.totalPrompts : 0;
            const guidesDelta = prev ? c.totalGuides - prev.totalGuides : 0;
            const maturityDelta = prev?.maturityScore != null && c.maturityScore != null
              ? c.maturityScore - prev.maturityScore : null;

            return (
              <details key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden" open={i === 0}>
                <summary className="cursor-pointer p-4 hover:bg-slate-800/30 flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm text-cyan-300 shrink-0">
                    {new Date(c.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                  {c.maturityScore != null && (
                    <span className="bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-xs font-mono font-bold">
                      {c.maturityScore}/10
                      {maturityDelta != null && maturityDelta !== 0 && (
                        <span className={maturityDelta > 0 ? "text-emerald-400 mr-1" : "text-red-400 mr-1"}>
                          ({maturityDelta > 0 ? "+" : ""}{maturityDelta.toFixed(1)})
                        </span>
                      )}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 font-mono">
                    📚 {c.totalPrompts.toLocaleString()}
                    {promptsDelta !== 0 && <span className={promptsDelta > 0 ? "text-emerald-400 mr-1" : "text-red-400 mr-1"}>({promptsDelta > 0 ? "+" : ""}{promptsDelta})</span>}
                    {" · "}
                    📖 {c.totalGuides}
                    {guidesDelta !== 0 && <span className={guidesDelta > 0 ? "text-emerald-400 mr-1" : "text-red-400 mr-1"}>({guidesDelta > 0 ? "+" : ""}{guidesDelta})</span>}
                  </span>
                  <span className="text-xs text-slate-300 line-clamp-1 flex-1 min-w-0">
                    {c.identity}
                  </span>
                </summary>

                <div className="p-4 border-t border-slate-800 space-y-4">
                  <div>
                    <div className="text-[10px] uppercase text-purple-400 mb-1 font-semibold">זהות</div>
                    <p className="text-sm text-slate-100 leading-relaxed">{c.identity}</p>
                  </div>

                  {Array.isArray(c.todayLearnings) && (c.todayLearnings as any[]).length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase text-cyan-400 mb-2 font-semibold">💡 מה למדתי באותו יום</div>
                      <ul className="space-y-1 text-xs text-slate-200">
                        {(c.todayLearnings as any[]).map((l, j) => (
                          <li key={j} className="bg-slate-950/40 border border-cyan-500/20 rounded p-2">
                            <span className="text-cyan-300 font-semibold">{l.topic}:</span> {l.insight}
                            {l.evidence && <span className="text-slate-500 text-[10px] block mt-1">📊 {l.evidence}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(c.tomorrowFocus) && (c.tomorrowFocus as any[]).length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase text-amber-400 mb-2 font-semibold">🎯 על מה התכוונתי להתמקד מחר</div>
                      <ol className="space-y-1 text-xs text-slate-200">
                        {(c.tomorrowFocus as any[]).map((f, j) => (
                          <li key={j} className="bg-slate-950/40 border border-amber-500/20 rounded p-2 flex gap-2">
                            <span className="text-amber-300 font-bold shrink-0">{f.priority || j + 1}.</span>
                            <div>
                              <div>{f.action}</div>
                              {f.why && <div className="text-slate-500 text-[10px] mt-0.5">⤷ {f.why}</div>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {c.weeklyArc && (
                    <div className="bg-slate-950/40 border border-slate-800 rounded p-3">
                      <div className="text-[10px] uppercase text-slate-400 mb-1 font-semibold">📈 קשת שבועית</div>
                      <p className="text-xs text-slate-300 italic">{c.weeklyArc}</p>
                    </div>
                  )}

                  <div className="flex gap-3 text-[10px] text-slate-500 font-mono pt-2 border-t border-slate-800">
                    <span>+{c.promptsAddedToday} פרומפטים</span>
                    <span>+{c.guidesAddedToday} מדריכים</span>
                    <span>{c.upgradesToday} שדרוגים</span>
                    <span>{c.imagesGenToday} תמונות</span>
                    <span>{c.videosGenToday} סרטונים</span>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
