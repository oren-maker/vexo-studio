import { prisma } from "@/lib/learn/db";

const ACTION_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  "clip-added": { icon: "➕", label: "קליפים נוספו", color: "text-emerald-300" },
  "clip-removed": { icon: "➖", label: "קליפ הוסר", color: "text-red-300" },
  "clip-reordered": { icon: "↕️", label: "סדר שונה", color: "text-cyan-300" },
  "clip-trimmed": { icon: "✂️", label: "חיתוך/עריכת קליפים", color: "text-amber-300" },
  "transition-changed": { icon: "✨", label: "מעבר שונה", color: "text-purple-300" },
  "audio-changed": { icon: "🔊", label: "אודיו שונה", color: "text-blue-300" },
  "engine-changed": { icon: "🧩", label: "מנוע שונה", color: "text-cyan-300" },
  "merge-started": { icon: "🚀", label: "מיזוג התחיל", color: "text-amber-300" },
  "merge-completed": { icon: "✅", label: "מיזוג הושלם", color: "text-emerald-300" },
  "merge-failed": { icon: "❌", label: "מיזוג נכשל", color: "text-red-300" },
  "ai-transition-generated": { icon: "🤖", label: "AI transition נוצר", color: "text-purple-300" },
};

export default async function MergeEditLog({ jobId }: { jobId: string }) {
  const edits = await prisma.mergeEdit.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (edits.length === 0) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
        📋 לוג עריכות ({edits.length})
      </h2>
      <ol className="space-y-1 max-h-96 overflow-y-auto">
        {edits.map((e) => {
          const meta = ACTION_LABELS[e.action] || { icon: "•", label: e.action, color: "text-slate-300" };
          return (
            <li key={e.id} className="text-xs flex items-start gap-2 py-1.5 border-b border-slate-800/50 last:border-0">
              <span className="text-base shrink-0">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${meta.color}`}>{meta.label}</div>
                {e.details && (
                  <div className="text-[10px] text-slate-500 font-mono truncate" dir="ltr">
                    {JSON.stringify(e.details).slice(0, 200)}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-600 font-mono shrink-0">
                {new Date(e.createdAt).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
