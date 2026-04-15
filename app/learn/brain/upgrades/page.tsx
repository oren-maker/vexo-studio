import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

export default async function BrainUpgradesPage({ searchParams }: { searchParams: { archive?: string } }) {
  const isArchive = searchParams.archive === "1";
  const activeStatuses = ["pending", "in-progress"];
  const archiveStatuses = ["done", "rejected"];
  const whereStatuses = isArchive ? archiveStatuses : activeStatuses;

  const [upgrades, counts] = await Promise.all([
    prisma.brainUpgradeRequest.findMany({
      where: { status: { in: whereStatuses } },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.brainUpgradeRequest.groupBy({ by: ["status"], _count: true }),
  ]);
  const byStatus: Record<string, number> = {};
  counts.forEach((c) => { byStatus[c.status] = c._count as any; });
  const activeCount = (byStatus.pending || 0) + (byStatus["in-progress"] || 0);
  const archiveCount = (byStatus.done || 0) + (byStatus.rejected || 0);

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/learn/brain" className="text-xs text-slate-400 hover:text-cyan-400">← חזרה למוח</Link>
          <h1 className="text-3xl font-bold text-white mt-1">🔧 בקשות שדרוג</h1>
          <p className="text-sm text-slate-400 mt-1">
            {isArchive ? "ארכיון: שדרוגים שהושלמו או נדחו" : "פעילים: ממתינים + בעבודה. Claude מיישם אותם בשדרוגים הבאים."}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href="/learn/brain/upgrades"
            className={`px-3 py-1.5 rounded border font-semibold ${!isArchive ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"}`}
          >
            🔧 פעילים ({activeCount})
          </Link>
          <Link
            href="/learn/brain/upgrades?archive=1"
            className={`px-3 py-1.5 rounded border ${isArchive ? "bg-slate-700 border-slate-500 text-slate-100" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"}`}
          >
            📦 ארכיון ({archiveCount})
          </Link>
        </div>
      </header>

      {!isArchive && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatBox value={byStatus.pending || 0} label="⏳ ממתינים" color="amber" />
          <StatBox value={byStatus["in-progress"] || 0} label="🔄 בעבודה" color="cyan" />
        </div>
      )}

      {upgrades.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
          {isArchive
            ? "הארכיון ריק."
            : <>אין שדרוגים פעילים. דבר עם המוח ב-<Link href="/learn/brain/chat" className="text-cyan-400 underline">/learn/brain/chat</Link> ותן הוראות.</>
          }
        </div>
      ) : (
        <div className="space-y-2">
          {upgrades.map((u) => (
            <div
              key={u.id}
              className={`rounded-lg p-4 border ${
                u.status === "pending" ? "bg-amber-500/5 border-amber-500/30" :
                u.status === "in-progress" ? "bg-cyan-500/5 border-cyan-500/30" :
                u.status === "done" ? "bg-emerald-500/5 border-emerald-500/30 opacity-70" :
                "bg-slate-900/60 border-slate-800 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <span className="text-[10px] uppercase font-semibold tracking-wider">
                  {u.status === "pending" && "⏳ ממתין"}
                  {u.status === "in-progress" && "🔄 בעבודה"}
                  {u.status === "done" && "✓ הושלם"}
                  {u.status === "rejected" && "✗ נדחה"}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(u.createdAt).toLocaleString("he-IL")}
                </span>
              </div>
              <div className="text-sm text-slate-100 whitespace-pre-wrap">{u.instruction}</div>
              {u.claudeNotes && (
                <div className="mt-2 text-xs text-slate-400 border-t border-slate-800 pt-2">
                  <span className="text-emerald-400 font-semibold">📝 ביצוע:</span> {u.claudeNotes}
                </div>
              )}
              {u.chatId && (
                <Link
                  href={`/learn/brain/chat?id=${u.chatId}`}
                  className="text-[10px] text-cyan-400 hover:underline mt-2 inline-block"
                >
                  מקור: שיחה ←
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ value, label, color }: { value: number; label: string; color: "amber" | "cyan" }) {
  const c = color === "amber" ? "text-amber-300" : "text-cyan-300";
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`text-3xl font-black ${c}`}>{value.toLocaleString()}</div>
      <div className="text-sm text-slate-300 mt-1">{label}</div>
    </div>
  );
}
