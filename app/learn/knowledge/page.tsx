import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

const TYPES = ["technique", "style", "how_to", "insight"];

const typeColors: Record<string, string> = {
  technique: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  style: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  how_to: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  insight: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

export default async function KnowledgeExplorer({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const type = searchParams.type;
  const nodes = await prisma.knowledgeNode.findMany({
    where: type ? { type } : {},
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const counts = await prisma.knowledgeNode.groupBy({
    by: ["type"],
    _count: { type: true },
  });
  const totalByType = Object.fromEntries(counts.map((c) => [c.type, c._count.type]));

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">Knowledge Base</h1>
        <p className="text-sm text-slate-400 mt-1">
          כל ה-KnowledgeNodes שחולצו מהסרטונים - נשלחים ל-AI Director כ-RAG context.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-5">
        <a
          href="/learn/knowledge"
          className={`px-4 py-1.5 rounded-full text-xs border ${!type ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-slate-800 text-slate-400 border-slate-700"}`}
        >
          הכל ({nodes.length})
        </a>
        {TYPES.map((t) => (
          <a
            key={t}
            href={`/learn/knowledge?type=${t}`}
            className={`px-4 py-1.5 rounded-full text-xs border ${type === t ? typeColors[t] : "bg-slate-800 text-slate-400 border-slate-700"}`}
          >
            {t} ({totalByType[t] || 0})
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {nodes.map((n) => {
          const tags = n.tags;
          return (
            <div key={n.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${typeColors[n.type] || "bg-slate-800"}`}>
                  {n.type}
                </span>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span>{Math.round(n.confidence * 100)}%</span>
                  <span>{n.sentToDirector ? "✅" : "⏳"}</span>
                </div>
              </div>
              <div className="text-sm font-semibold text-white mb-1">{n.title}</div>
              <p className="text-xs text-slate-400 line-clamp-3">{n.body}</p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.slice(0, 5).map((t) => (
                    <span key={t} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {nodes.length === 0 && (
          <div className="col-span-full bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
            אין knowledge nodes עדיין. ניתוח מוצלח של סרטון יצור אותם אוטומטית.
          </div>
        )}
      </div>
    </div>
  );
}
