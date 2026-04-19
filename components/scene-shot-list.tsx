"use client";
// Renders the structured shot list that generate_shot_list stored in
// Scene.memoryContext.shotList. Pure display — no fetch, parent passes
// the memoryContext blob.

type Shot = {
  order?: number;
  shotType?: string;
  lensMm?: number;
  movement?: string;
  subject?: string;
  action?: string;
  durationSec?: number;
  notes?: string;
};

export function SceneShotList({ shots, he = true }: { shots: unknown; he?: boolean }) {
  if (!Array.isArray(shots) || shots.length === 0) return null;
  const list = shots as Shot[];
  const totalDuration = list.reduce((s, sh) => s + (sh.durationSec ?? 0), 0);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-200">🎞 Shot list ({list.length})</h3>
        {totalDuration > 0 && <div className="text-xs text-slate-400 num">~{totalDuration}s סך הכל</div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-slate-800 rounded-lg overflow-hidden">
          <thead className="bg-slate-950/60 text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-right">#</th>
              <th className="px-2 py-1.5 text-right">shot</th>
              <th className="px-2 py-1.5 text-right">lens</th>
              <th className="px-2 py-1.5 text-right">תנועה</th>
              <th className="px-2 py-1.5 text-right">subject</th>
              <th className="px-2 py-1.5 text-right">action</th>
              <th className="px-2 py-1.5 text-right">sec</th>
            </tr>
          </thead>
          <tbody>
            {list.map((sh, i) => (
              <tr key={i} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-2 py-1.5 text-slate-500 num">{sh.order ?? i + 1}</td>
                <td className="px-2 py-1.5 text-cyan-300 font-mono">{sh.shotType ?? "—"}</td>
                <td className="px-2 py-1.5 text-slate-400 num">{sh.lensMm ? `${sh.lensMm}mm` : "—"}</td>
                <td className="px-2 py-1.5 text-amber-300">{sh.movement ?? "—"}</td>
                <td className="px-2 py-1.5 text-slate-200 max-w-[160px] truncate" title={sh.subject}>{sh.subject ?? "—"}</td>
                <td className="px-2 py-1.5 text-slate-300 max-w-[240px] truncate" title={sh.action}>{sh.action ?? "—"}</td>
                <td className="px-2 py-1.5 text-slate-400 num">{sh.durationSec ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.some((sh) => sh.notes) && (
        <details className="mt-2">
          <summary className="text-xs text-slate-500 cursor-pointer">הערות ({list.filter((sh) => sh.notes).length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {list.filter((sh) => sh.notes).map((sh, i) => (
              <li key={i}><span className="text-cyan-500 num">#{sh.order ?? i + 1}:</span> {sh.notes}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
