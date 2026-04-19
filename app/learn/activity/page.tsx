"use client";
import { useEffect, useState } from "react";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";

type DayBucket = { day: string; total: number; actions: number; logs: number; failures: number };
type Payload = {
  windowDays: number;
  totalEvents: number;
  actionsTotal: number;
  logsTotal: number;
  series: DayBucket[];
  byActionType: { type: string; count: number }[];
};

const WEEKS = 13; // 13 weeks × 7 = 91 days (covers default 90-day window)
const DAY_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function colorFor(total: number, max: number): string {
  if (total === 0) return "bg-slate-800";
  const pct = total / max;
  if (pct > 0.75) return "bg-cyan-400";
  if (pct > 0.5) return "bg-cyan-500";
  if (pct > 0.25) return "bg-cyan-600";
  return "bg-cyan-700";
}

export default function ActivityPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    learnFetch("/api/v1/learn/activity?days=91", { headers: adminHeaders() })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); else setErr(j.error || "failed"); })
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <div className="max-w-4xl mx-auto p-6 text-red-400">{err}</div>;
  if (!data) return <div className="max-w-4xl mx-auto p-6 text-slate-400">טוען…</div>;

  const max = Math.max(...data.series.map((s) => s.total), 1);

  // Group days into weeks for the heatmap grid.
  // The series starts WEEKS*7 days ago, ending today. Each column = one week.
  const weeks: DayBucket[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const wk: DayBucket[] = [];
    for (let d = 0; d < 7; d++) {
      const i = w * 7 + d;
      if (i < data.series.length) wk.push(data.series[i]);
    }
    weeks.push(wk);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">📅 פעילות — {data.windowDays} ימים אחרונים</h1>
        <p className="text-sm text-slate-400 mt-1">אגרגצייה של ActionOutcome + SceneLog. לחיצה לפרטים.</p>
      </header>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label={"סה\"כ אירועים"} value={data.totalEvents} />
        <Stat label="פעולות הבמאי" value={data.actionsTotal} />
        <Stat label="לוגים" value={data.logsTotal} />
        <Stat label="ימים פעילים" value={data.series.filter((s) => s.total > 0).length} />
      </div>

      <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">heatmap יומי</h2>
        <div className="flex gap-1" dir="ltr">
          <div className="flex flex-col gap-1 pt-1">
            {DAY_LABELS.map((l) => <div key={l} className="h-3 text-[9px] text-slate-500 font-mono w-4 flex items-center">{l}</div>)}
          </div>
          <div className="flex gap-1 flex-1">
            {weeks.map((wk, wi) => (
              <div key={wi} className="flex flex-col gap-1 flex-1">
                {wk.map((day) => (
                  <div
                    key={day.day}
                    title={`${day.day}: ${day.total} אירועים (${day.actions} actions, ${day.logs} logs${day.failures ? `, ${day.failures} failures` : ""})`}
                    className={`h-3 rounded-sm ${colorFor(day.total, max)} ${day.failures > 0 ? "ring-1 ring-rose-500" : ""}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-500">
          <span>פחות</span>
          <div className="flex gap-0.5">
            {[0, 0.2, 0.5, 0.8, 1].map((p, i) => <div key={i} className={`w-3 h-3 rounded-sm ${colorFor(Math.round(p * max), max)}`} />)}
          </div>
          <span>יותר</span>
          <span className="ms-4">🔴 יש כישלונות</span>
        </div>
      </section>

      {data.byActionType.length > 0 && (
        <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">פעולות לפי סוג</h2>
          <ul className="space-y-2">
            {data.byActionType.map((row) => {
              const pct = (row.count / data.actionsTotal) * 100;
              return (
                <li key={row.type}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-mono">{row.type}</span>
                    <span className="text-slate-400">{row.count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-2xl font-bold text-slate-100 num">{value.toLocaleString()}</div>
    </div>
  );
}
