"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type Payload = {
  characters: { id: string; name: string; roleType: string | null; episodeCount: number }[];
  pairs: Record<string, number>;
  totalEpisodes: number;
};

function cellColor(count: number, max: number): string {
  if (count === 0) return "bg-slate-900";
  const pct = count / max;
  if (pct > 0.66) return "bg-cyan-400 text-slate-950";
  if (pct > 0.33) return "bg-cyan-500 text-slate-950";
  return "bg-cyan-700 text-slate-100";
}

export default function CharacterMatrixPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<Payload>(`/api/v1/projects/${id}/character-matrix`).then(setData).catch((e) => setErr((e as Error).message));
  }, [id]);

  if (err) return <div className="max-w-5xl mx-auto p-6 text-red-400">{err}</div>;
  if (!data) return <div className="max-w-5xl mx-auto p-6 text-text-muted">טוען…</div>;

  const maxPair = Math.max(1, ...Object.entries(data.pairs).filter(([k]) => !k.startsWith(k.split("::")[0] + "::" + k.split("::")[0])).map(([, v]) => v));

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">🎭 Co-appearance matrix</h1>
        <p className="text-sm text-slate-400 mt-1">כמה פרקים כל זוג דמויות חולקות. {data.characters.length} דמויות · {data.totalEpisodes} פרקים סה"כ.</p>
        <Link href={`/projects/${id}/dashboard`} className="text-sm text-accent hover:underline mt-2 inline-block">← חזרה לדשבורד</Link>
      </header>

      {data.characters.length === 0 ? (
        <div className="text-center py-10 text-slate-500">אין דמויות עדיין בפרויקט</div>
      ) : (
        <div className="overflow-x-auto bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <table className="text-xs" dir="ltr">
            <thead>
              <tr>
                <th className="sticky start-0 bg-slate-900/40 px-2 py-1 text-slate-400 text-start">char</th>
                {data.characters.map((c) => (
                  <th key={c.id} className="px-2 py-1 font-normal text-slate-400 writing-mode-vertical text-[10px]" style={{ writingMode: "vertical-rl", whiteSpace: "nowrap", minHeight: 80 }}>
                    {c.name.slice(0, 14)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.characters.map((rowChar) => (
                <tr key={rowChar.id}>
                  <td className="sticky start-0 bg-slate-900/40 px-2 py-1 text-slate-200 font-semibold text-start whitespace-nowrap">
                    <Link href={`/characters/${rowChar.id}`} className="hover:text-cyan-300">{rowChar.name}</Link>
                    <span className="text-[9px] text-slate-500 ms-1">({rowChar.episodeCount})</span>
                  </td>
                  {data.characters.map((colChar) => {
                    const key = rowChar.id < colChar.id ? `${rowChar.id}::${colChar.id}` : `${colChar.id}::${rowChar.id}`;
                    const count = data.pairs[key] ?? 0;
                    const isDiag = rowChar.id === colChar.id;
                    return (
                      <td
                        key={colChar.id}
                        title={`${rowChar.name} × ${colChar.name}: ${count} episodes`}
                        className={`w-10 h-10 text-center font-mono ${isDiag ? "bg-slate-800 text-slate-500 border border-slate-700" : cellColor(count, maxPair)}`}
                      >
                        {count > 0 ? count : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.characters.length > 0 && (
        <div className="text-xs text-slate-500 flex items-center gap-3" dir="ltr">
          <span>Lower</span>
          <div className="flex gap-0.5">
            {[0, 0.3, 0.5, 0.8].map((p) => <div key={p} className={`w-4 h-4 ${cellColor(Math.round(p * maxPair), maxPair)}`} />)}
          </div>
          <span>Higher</span>
          <span className="ms-4">(max pair: {maxPair} episodes shared)</span>
        </div>
      )}
    </div>
  );
}
