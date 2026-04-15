import { prisma } from "@/lib/learn/db";
import PromptDiffViewer from "@/components/learn/prompt-diff-viewer";

export default async function PromptVersionsLog({ sourceId }: { sourceId: string }) {
  const [versions, source] = await Promise.all([
    prisma.promptVersion.findMany({
      where: { sourceId },
      orderBy: { version: "desc" },
      take: 20,
    }),
    prisma.learnSource.findUnique({ where: { id: sourceId }, select: { prompt: true } }),
  ]);

  if (versions.length === 0) return null;
  const currentPrompt = source?.prompt || "";

  return (
    <div className="bg-slate-900/60 border border-amber-500/30 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wider">
          📜 לוג גרסאות ({versions.length})
        </h2>
        <span className="text-[10px] text-slate-500">גרסאות קודמות של הפרומפט נשמרות אוטומטית</span>
      </div>

      <div className="space-y-2">
        {versions.map((v) => {
          const diff = v.diff as any;
          return (
            <details key={v.id} className="bg-slate-950/40 rounded-lg border border-slate-800">
              <summary className="cursor-pointer p-3 hover:bg-slate-950/60 rounded-t-lg">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="bg-amber-500/20 text-amber-300 font-bold text-[11px] px-2 py-0.5 rounded">
                    v{v.version}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(v.createdAt).toLocaleString("he-IL")}
                  </span>
                  {v.triggeredBy && (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                      {v.triggeredBy}
                    </span>
                  )}
                  {diff && (diff.linesAdded || diff.linesRemoved) && (
                    <span className="text-[10px] text-slate-500">
                      {diff.linesAdded ? <span className="text-emerald-400">+{diff.linesAdded}</span> : null}
                      {diff.linesRemoved ? <span className="text-red-400 mr-1">−{diff.linesRemoved}</span> : null}
                      {diff.wordDiff !== undefined && (
                        <span className="mr-1">
                          ({diff.wordDiff > 0 ? "+" : ""}{diff.wordDiff} words)
                        </span>
                      )}
                    </span>
                  )}
                  {v.reason && (
                    <span className="text-xs text-slate-300 italic line-clamp-1 flex-1">
                      💡 {v.reason}
                    </span>
                  )}
                  <PromptDiffViewer
                    oldPrompt={v.prompt}
                    newPrompt={currentPrompt}
                    oldLabel={`v${v.version}`}
                    newLabel="נוכחי"
                  />
                </div>
              </summary>
              <div className="p-3 border-t border-slate-800">
                {v.reason && (
                  <div className="mb-3 bg-amber-500/5 border border-amber-500/20 rounded p-2 text-xs text-slate-200">
                    <b className="text-amber-400">סיבת השינוי:</b> {v.reason}
                  </div>
                )}
                <div className="text-[10px] uppercase text-slate-500 mb-1">תוכן גרסה v{v.version}</div>
                <pre className="bg-slate-950/70 rounded p-3 text-[11px] text-slate-100 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto" dir="ltr">
                  {v.prompt}
                </pre>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
