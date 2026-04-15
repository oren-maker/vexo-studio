import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import BrainRefreshButton from "@/components/learn/brain-refresh-button";
import ConnectedSystemsBanner from "@/components/learn/brain/connected-systems-banner";
import ModuleHeader from "@/components/learn/module-header";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [caches, totalCacheCount, totalChatCount, pendingUpgrades] = await Promise.all([
    prisma.dailyBrainCache.findMany({ orderBy: { date: "desc" }, take: 14 }),
    prisma.dailyBrainCache.count(),
    prisma.brainChat.count(),
    prisma.brainUpgradeRequest.count({ where: { status: { in: ["pending", "in-progress"] } } }),
  ]);
  const today = caches[0];

  return (
    <div className="max-w-5xl mx-auto">
      <ModuleHeader title="🧠 המוח" operations={["knowledge-extract", "brain-chat"]} logsTab="snapshots" />
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">🧠 המוח</h1>
          <p className="text-sm text-slate-400 mt-1">
            המוח מחבר בין <b className="text-amber-300">תודעה</b> (snapshots), <b className="text-cyan-300">זיכרון</b> (פרומפטים+מדריכים), ו-<b className="text-emerald-300">ידע</b> (Knowledge Nodes) — וכותב כל יום זהות חדשה.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <Link
            href="/learn/brain/chat"
            className="text-xs bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded text-center font-semibold"
          >
            💬 דבר עם המוח {totalChatCount > 0 && <span className="opacity-70">({totalChatCount})</span>}
          </Link>
          <Link
            href="/learn/brain/history"
            className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-3 py-1.5 rounded text-center"
          >
            📜 לוגי המוח ({totalCacheCount})
          </Link>
          <Link
            href="/learn/brain/upgrades"
            className={`text-xs border px-3 py-1.5 rounded text-center ${
              pendingUpgrades > 0 ? "bg-amber-500/15 text-amber-300 border-amber-500/40 font-semibold" : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
          >
            🔧 שדרוגים {pendingUpgrades > 0 && `(${pendingUpgrades})`}
          </Link>
          <BrainRefreshButton />
        </div>
      </header>

      <ConnectedSystemsBanner />

      {!today ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
          <div className="text-5xl mb-3">🧠</div>
          <h2 className="text-lg font-semibold text-white mb-1">המוח עוד לא הופעל</h2>
          <p className="text-sm text-slate-400 mb-4">לחץ &quot;🔄 רענן עכשיו&quot; כדי לחבר את הזהות הראשונה.</p>
        </div>
      ) : (
        <>
          {/* Today's identity */}
          <section className="mb-6 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-purple-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-[10px] uppercase text-purple-300 font-semibold">מי אני היום · {new Date(today.date).toLocaleDateString("he-IL")}</div>
              {today.maturityScore != null && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 uppercase">בגרות</span>
                  <span className="text-2xl font-black text-purple-300">{today.maturityScore}</span>
                  <span className="text-[10px] text-slate-500">/10</span>
                </div>
              )}
            </div>
            <p className="text-base text-slate-100 leading-relaxed">{today.identity}</p>
          </section>

          {/* Stats snapshot */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Stat value={today.totalPrompts} label="פרומפטים" delta={today.promptsAddedToday} />
            <Stat value={today.totalGuides} label="מדריכים" delta={today.guidesAddedToday} />
            <Stat value={today.totalNodes} label="Knowledge Nodes" />
            <Stat value={today.totalEmbeddings} label="Embedded" />
            <Stat value={today.upgradesToday} label="שדרוגי פרומפט היום" delta={null} accent="amber" />
          </section>

          {/* Today's learnings */}
          {Array.isArray(today.todayLearnings) && (today.todayLearnings as any[]).length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-bold text-white mb-3">💡 מה למדתי היום</h2>
              <div className="space-y-2">
                {(today.todayLearnings as any[]).map((l, i) => (
                  <div key={i} className="bg-slate-900/60 border border-cyan-500/30 rounded-lg p-4">
                    <div className="text-[10px] uppercase text-cyan-400 mb-1 font-semibold">{l.topic}</div>
                    <div className="text-sm text-slate-100 mb-1">{l.insight}</div>
                    {l.evidence && <div className="text-[11px] text-slate-500">📊 {l.evidence}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tomorrow focus */}
          {Array.isArray(today.tomorrowFocus) && (today.tomorrowFocus as any[]).length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-bold text-white mb-3">🎯 על מה להתמקד מחר</h2>
              <ol className="space-y-2">
                {(today.tomorrowFocus as any[]).map((f, i) => (
                  <li key={i} className="bg-slate-900/60 border border-amber-500/30 rounded-lg p-4 flex gap-3 items-start">
                    <span className="text-amber-300 font-black text-xl shrink-0 leading-none">{f.priority || i + 1}</span>
                    <div className="flex-1">
                      <div className="text-sm text-slate-100 font-medium">{f.action}</div>
                      {f.why && <div className="text-[11px] text-slate-400 mt-1">⤷ {f.why}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Weekly arc */}
          {today.weeklyArc && (
            <section className="mb-6 bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">📈 הקשת השבועית</h2>
              <p className="text-sm text-slate-200 leading-relaxed">{today.weeklyArc}</p>
            </section>
          )}

          {/* Evolution timeline */}
          {caches.length > 1 && (
            <section className="mb-6">
              <h2 className="text-lg font-bold text-white mb-3">🕰 היסטוריית זהויות (14 ימים אחרונים)</h2>
              <div className="space-y-2">
                {caches.slice(1).map((c) => (
                  <details key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-lg">
                    <summary className="cursor-pointer p-3 hover:bg-slate-800/30 flex items-center justify-between gap-3 flex-wrap text-xs">
                      <span className="font-mono text-slate-400">{new Date(c.date).toLocaleDateString("he-IL")}</span>
                      <span className="flex-1 text-slate-300 truncate">{c.identity}</span>
                      {c.maturityScore != null && <span className="text-purple-300 font-mono">{c.maturityScore}/10</span>}
                    </summary>
                    <div className="p-3 border-t border-slate-800 text-xs text-slate-300 space-y-2">
                      <p>{c.identity}</p>
                      {c.weeklyArc && <p className="text-slate-400 italic">{c.weeklyArc}</p>}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, delta, accent }: { value: number; label: string; delta?: number | null; accent?: "amber" }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className={`text-2xl font-black ${accent === "amber" ? "text-amber-300" : "text-cyan-300"}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-slate-300 mt-0.5">{label}</div>
      {delta != null && delta !== 0 && (
        <div className={`text-[10px] mt-0.5 font-mono ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
          {delta > 0 ? "+" : ""}{delta} היום
        </div>
      )}
    </div>
  );
}
