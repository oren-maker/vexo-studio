import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

export default async function BrainChatLogsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  const modeFilter: "vexo" | "obsidian" | "compare" | null =
    params.mode === "vexo" || params.mode === "obsidian" || params.mode === "compare" ? params.mode : null;

  // compare filter shows only chats that belong to a compareGroupId
  const where = modeFilter === "compare"
    ? { compareGroupId: { not: null } }
    : modeFilter
    ? { brainMode: modeFilter }
    : {};

  const chats = await prisma.brainChat.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { _count: { select: { messages: true } }, messages: { orderBy: { createdAt: "asc" }, take: 2 } },
  });

  const [vexoCount, obsidianCount, compareGroupsAgg] = await Promise.all([
    prisma.brainChat.count({ where: { brainMode: "vexo" } }),
    prisma.brainChat.count({ where: { brainMode: "obsidian" } }),
    prisma.brainChat.groupBy({ by: ["compareGroupId"], where: { compareGroupId: { not: null } }, _count: true }),
  ]);
  const compareCount = compareGroupsAgg.length;

  // For the "compare" view: group chats by compareGroupId so pairs render together.
  const groupedCompare = modeFilter === "compare"
    ? Object.values(
        chats.reduce<Record<string, typeof chats>>((acc, c) => {
          const gid = c.compareGroupId ?? "_lone";
          (acc[gid] ??= []).push(c);
          return acc;
        }, {}),
      ).sort((a, b) => b[0].updatedAt.getTime() - a[0].updatedAt.getTime())
    : null;

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/learn/brain/chat" className="text-xs text-slate-400 hover:text-cyan-400">← שיחה חדשה</Link>
          <h1 className="text-3xl font-bold text-white mt-1">📂 לוגי שיחות עם המוח</h1>
          <p className="text-sm text-slate-400 mt-1">{chats.length} שיחות מוצגות.</p>
        </div>
        <Link
          href="/learn/brain"
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded"
        >
          חזרה למוח
        </Link>
      </header>

      <div className="mb-4 inline-flex rounded-lg border border-slate-700 bg-slate-900/50 overflow-hidden text-xs font-semibold flex-wrap">
        <Link href="/learn/brain/chat/logs" className={`px-3 py-1.5 ${!modeFilter ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>
          הכל ({vexoCount + obsidianCount})
        </Link>
        <Link href="/learn/brain/chat/logs?mode=vexo" className={`px-3 py-1.5 ${modeFilter === "vexo" ? "bg-cyan-500/30 text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>
          🎬 Vexo ({vexoCount})
        </Link>
        <Link href="/learn/brain/chat/logs?mode=obsidian" className={`px-3 py-1.5 ${modeFilter === "obsidian" ? "bg-purple-500/30 text-purple-200" : "text-slate-400 hover:text-slate-200"}`}>
          📓 Obsidian ({obsidianCount})
        </Link>
        <Link href="/learn/brain/chat/logs?mode=compare" className={`px-3 py-1.5 ${modeFilter === "compare" ? "bg-amber-500/30 text-amber-200" : "text-slate-400 hover:text-slate-200"}`}>
          ⚖️ השוואות ({compareCount})
        </Link>
      </div>

      {chats.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
          אין שיחות עדיין. <Link href="/learn/brain/chat" className="text-cyan-400 underline">התחל שיחה</Link>
        </div>
      ) : groupedCompare ? (
        <div className="space-y-3">
          {groupedCompare.map((pair) => {
            const vexo = pair.find((c) => c.brainMode === "vexo");
            const obsidian = pair.find((c) => c.brainMode === "obsidian");
            const preview = pair[0].messages[0]?.content || "";
            const updatedAt = Math.max(...pair.map((c) => c.updatedAt.getTime()));
            return (
              <div key={pair[0].compareGroupId} className="bg-slate-900/60 border border-amber-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-amber-300 font-bold">⚖️ השוואה</div>
                  <div className="text-[10px] text-slate-500 font-mono">{new Date(updatedAt).toLocaleString("he-IL")}</div>
                </div>
                <div className="text-xs text-slate-300 mb-3 line-clamp-2">{preview}</div>
                <div className="grid md:grid-cols-2 gap-2">
                  {[vexo, obsidian].filter(Boolean).map((c) => (
                    <Link
                      key={c!.id}
                      href={`/learn/brain/chat?id=${c!.id}&mode=${c!.brainMode}`}
                      className={`block rounded-md p-2 border text-xs ${c!.brainMode === "obsidian" ? "border-purple-500/30 hover:border-purple-500/60 bg-purple-500/5" : "border-cyan-500/30 hover:border-cyan-500/60 bg-cyan-500/5"}`}
                    >
                      <div className={`font-semibold mb-1 ${c!.brainMode === "obsidian" ? "text-purple-300" : "text-cyan-300"}`}>
                        {c!.brainMode === "obsidian" ? "📓 Obsidian" : "🎬 Vexo"} · {c!._count.messages} הודעות
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-2">{c!.title || "(ללא כותרת)"}</div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map((c) => {
            const preview = c.messages[0]?.content || "";
            const isCompare = !!c.compareGroupId;
            return (
              <Link
                key={c.id}
                href={`/learn/brain/chat?id=${c.id}&mode=${c.brainMode}`}
                className="block bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 rounded-lg p-4 transition"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <div className="text-sm font-semibold text-white line-clamp-1 flex-1 flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.brainMode === "obsidian" ? "bg-purple-500/20 text-purple-300" : "bg-cyan-500/20 text-cyan-300"}`}>
                      {c.brainMode === "obsidian" ? "📓" : "🎬"}
                    </span>
                    {isCompare && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">⚖️</span>}
                    {c.title || "(ללא כותרת)"}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {new Date(c.updatedAt).toLocaleString("he-IL")}
                  </div>
                </div>
                <div className="text-xs text-slate-400 line-clamp-2">{preview}</div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                  <span>💬 {c._count.messages} הודעות</span>
                  {c.summarizedAt ? (
                    <span className="text-emerald-400">✓ סוכם ב-{new Date(c.summarizedAt).toLocaleDateString("he-IL")}</span>
                  ) : (
                    <span className="text-amber-400">⏳ ממתין לסיכום</span>
                  )}
                  {c.summary && <span className="text-slate-400 line-clamp-1 flex-1">📝 {c.summary}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
