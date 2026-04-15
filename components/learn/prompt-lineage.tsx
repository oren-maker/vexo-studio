import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export default async function PromptLineage({ sourceId }: { sourceId: string }) {
  const source = await prisma.learnSource.findUnique({
    where: { id: sourceId },
    include: {
      parentSource: { select: { id: true, title: true, addedBy: true } },
      children: {
        select: { id: true, title: true, addedBy: true, lineageNotes: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!source) return null;

  const hasParent = !!source.parentSource;
  const hasChildren = source.children.length > 0;
  if (!hasParent && !hasChildren) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mt-4">
      <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-4">
        🔗 פרומפטים קשורים · LINEAGE
      </h2>

      {hasParent && (
        <div className="mb-5">
          <div className="text-[10px] uppercase text-purple-400 font-semibold mb-2 tracking-wider">
            ⬆️ פרומפט הורה — ההשראה שלנו
          </div>
          <Link
            href={`/learn/sources/${source.parentSource!.id}`}
            className="block bg-slate-950/40 border border-purple-500/30 rounded-lg p-3 hover:bg-slate-950/70 transition"
          >
            <div className="text-sm text-white font-medium">{source.parentSource!.title || "(ללא כותרת)"}</div>
            <div className="text-[10px] text-slate-500">{source.parentSource!.addedBy || "—"}</div>
          </Link>
          {source.lineageNotes && (
            <details className="mt-2">
              <summary className="text-xs text-cyan-400 cursor-pointer hover:underline">
                💡 מה השתמשנו מההורה?
              </summary>
              <div className="mt-2 bg-purple-500/5 border border-purple-500/20 rounded p-3 text-xs text-slate-200 leading-relaxed">
                {source.lineageNotes}
              </div>
            </details>
          )}
        </div>
      )}

      {hasChildren && (
        <div>
          <div className="text-[10px] uppercase text-emerald-400 font-semibold mb-2 tracking-wider">
            ⬇️ פרומפטים שנולדו מכאן ({source.children.length})
          </div>
          <ul className="space-y-2">
            {source.children.map((c) => (
              <li key={c.id} className="bg-slate-950/40 border border-emerald-500/20 rounded-lg overflow-hidden">
                <Link href={`/learn/sources/${c.id}`} className="block p-3 hover:bg-slate-950/70 transition">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="text-sm text-white font-medium line-clamp-1">{c.title || "(ללא כותרת)"}</div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Date(c.createdAt).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">{c.addedBy || "—"}</div>
                </Link>
                {c.lineageNotes && (
                  <details className="border-t border-slate-800">
                    <summary className="px-3 py-2 text-[11px] text-cyan-400 cursor-pointer hover:bg-slate-950/50">
                      💡 מה הפרומפט הזה השתמש מהמקור
                    </summary>
                    <div className="px-3 pb-3 text-xs text-slate-300 leading-relaxed bg-emerald-500/5">
                      {c.lineageNotes}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
