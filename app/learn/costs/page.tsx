"use client";
import { useEffect, useState } from "react";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";

type Summary = {
  windowDays: number;
  grandTotal: number;
  entriesCount: number;
  byDay: { day: string; total: number }[];
  byProvider: { name: string; total: number; count: number }[];
  byCategory: { name: string; total: number; count: number }[];
  byProject: { name: string; total: number; count: number }[];
};

const WINDOWS = [7, 30, 90];

export default function CostsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load(d: number) {
    setLoading(true); setErr(null);
    try {
      const r = await learnFetch(`/api/v1/learn/costs/summary?days=${d}`, { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(days); }, [days]);

  const maxDay = data ? Math.max(...data.byDay.map((d) => d.total), 0.01) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">💰 לוח עלויות</h1>
          <p className="text-sm text-slate-400 mt-1">אגרגצייה על CostEntry — לפי יום · ספק · קטגוריה · פרויקט</p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 text-sm rounded-lg ${days === d ? "bg-cyan-500 text-slate-950 font-semibold" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              {d} ימים
            </button>
          ))}
        </div>
      </header>

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{err}</div>}
      {loading && <div className="text-slate-400 text-sm">טוען…</div>}

      {data && (
        <>
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="text-xs text-slate-400">סה"כ בחלון</div>
              <div className="text-3xl font-bold text-emerald-400 num">${data.grandTotal.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">{data.entriesCount.toLocaleString()} רשומות חיוב</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">ממוצע יומי</div>
              <div className="text-xl font-semibold num">${(data.grandTotal / data.windowDays).toFixed(2)}</div>
            </div>
          </div>

          {/* Daily sparkline bars */}
          <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">עלות יומית</h2>
            <div className="flex items-end gap-0.5 h-32" dir="ltr">
              {data.byDay.map((d) => {
                const h = Math.max(2, Math.round((d.total / maxDay) * 100));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end group relative" title={`${d.day}: $${d.total.toFixed(3)}`}>
                    <div className="w-full bg-cyan-500/60 group-hover:bg-cyan-400 rounded-t transition-colors" style={{ height: `${h}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono" dir="ltr">
              <span>{data.byDay[0]?.day}</span>
              <span>{data.byDay[data.byDay.length - 1]?.day}</span>
            </div>
          </section>

          <div className="grid md:grid-cols-3 gap-4">
            <BreakdownCard title="לפי ספק" rows={data.byProvider} total={data.grandTotal} />
            <BreakdownCard title="לפי קטגוריה" rows={data.byCategory} total={data.grandTotal} />
            <BreakdownCard title="לפי פרויקט" rows={data.byProject} total={data.grandTotal} />
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownCard({ title, rows, total }: { title: string; rows: { name: string; total: number; count: number }[]; total: number }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">{title}</h3>
      <ul className="space-y-2">
        {rows.slice(0, 8).map((r) => {
          const pct = total > 0 ? (r.total / total) * 100 : 0;
          return (
            <li key={r.name}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate me-2">{r.name}</span>
                <span className="text-slate-400 num">${r.total.toFixed(2)}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-cyan-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{r.count} calls · {pct.toFixed(1)}%</div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-xs text-slate-500">אין נתונים</li>}
      </ul>
    </div>
  );
}
