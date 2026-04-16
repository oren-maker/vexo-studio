"use client";

import { learnFetch } from "@/lib/learn/fetch";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Item = {
  slug: string;
  title: string;
  stagesBefore: number;
  status: "pending" | "running" | "done" | "failed";
  stagesAfter?: number;
  error?: string;
  took?: number;
};

export default function EnrichGuidesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [skipEnriched, setSkipEnriched] = useState(true);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const abortRef = useRef(false);

  async function loadGuides() {
    const r = await learnFetch("/api/v1/learn/guides?take=200").then((r) => r.json());
    const guides = (r.items ?? r.guides ?? []) as any[];
    setItems(
      guides.map((g) => ({
        slug: g.slug,
        title: g.translations?.[0]?.title || g.slug,
        stagesBefore: g._count?.stages ?? g.stagesCount ?? 0,
        status: "pending",
      }))
    );
  }

  useEffect(() => { loadGuides(); }, []);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const overallPct = items.length > 0 ? Math.round(((doneCount + failedCount) / items.length) * 100) : 0;

  async function enrichOne(slug: string): Promise<{ ok: boolean; stages?: number; error?: string }> {
    const t0 = Date.now();
    const r = await learnFetch(`/api/v1/learn/guides/${slug}/enrich`, { method: "POST" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, error: j.error || `${r.status}` };
    }
    const j = await r.json();
    return { ok: true, stages: j.stages };
  }

  async function startRun() {
    abortRef.current = false;
    setRunning(true);
    const list = [...items];
    for (let i = 0; i < list.length; i++) {
      if (abortRef.current) break;
      const it = list[i];
      if (it.status === "done") continue;
      if (skipEnriched && it.status === "done") continue;
      setCurrentIdx(i);
      setItems((prev) => prev.map((p, k) => (k === i ? { ...p, status: "running" } : p)));
      const t0 = Date.now();
      const res = await enrichOne(it.slug);
      const took = Date.now() - t0;
      setItems((prev) =>
        prev.map((p, k) =>
          k === i
            ? res.ok
              ? { ...p, status: "done", stagesAfter: res.stages, took }
              : { ...p, status: "failed", error: res.error, took }
            : p
        )
      );
    }
    setCurrentIdx(null);
    setRunning(false);
  }

  function stopRun() { abortRef.current = true; }

  async function enrichSingle(slug: string, idx: number) {
    setItems((prev) => prev.map((p, k) => (k === idx ? { ...p, status: "running" } : p)));
    const t0 = Date.now();
    const res = await enrichOne(slug);
    const took = Date.now() - t0;
    setItems((prev) =>
      prev.map((p, k) =>
        k === idx
          ? res.ok
            ? { ...p, status: "done", stagesAfter: res.stages, took }
            : { ...p, status: "failed", error: res.error, took }
          : p
      )
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-6">
        <Link href="/learn/guides" className="text-xs text-slate-400 hover:text-cyan-400">← חזרה למדריכים</Link>
        <h1 className="text-3xl font-bold text-white mt-1">✨ העשרת מדריכים עם Gemini</h1>
        <p className="text-sm text-slate-400 mt-1">
          כל מדריך נשלח ל-Gemini עם הכותרת, התיאור וראשי הסעיפים הקיימים. Gemini עושה מחקר מחדש, כותב 6-10 שלבים מעמיקים (200-400 מילים לשלב) עם קוד/ציטוטים/דוגמאות.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatBox value={items.length} label="סה״כ מדריכים" color="white" />
        <StatBox value={pendingCount} label="ממתינים" color="slate" />
        <StatBox value={doneCount} label="הושלמו" color="emerald" />
        <StatBox value={failedCount} label="נכשלו" color="red" />
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {!running && (
              <button
                onClick={startRun}
                disabled={items.length === 0}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                ▶ התחל העשרה של כולם
              </button>
            )}
            {running && (
              <button onClick={stopRun} className="bg-red-500 hover:bg-red-400 text-white font-medium px-5 py-2 rounded-lg text-sm">
                ⏸ עצור
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={skipEnriched} onChange={(e) => setSkipEnriched(e.target.checked)} />
              דלג על כאלה שכבר הועשרו
            </label>
          </div>
          <div className="text-sm text-cyan-300 font-bold">{overallPct}%</div>
        </div>
        <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
          <div className="h-full bg-gradient-to-l from-cyan-500 to-purple-500 transition-all duration-500" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="text-[11px] text-slate-500">
          זמן משוער: 20-45 שניות לכל מדריך · תהליך סדרתי (אחד אחרי השני כדי לא להרוג את ה-Gemini quota)
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-xs text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-3 text-right">#</th>
              <th className="px-4 py-3 text-right">כותרת</th>
              <th className="px-4 py-3 text-center">שלבים לפני</th>
              <th className="px-4 py-3 text-center">שלבים אחרי</th>
              <th className="px-4 py-3 text-center">סטטוס</th>
              <th className="px-4 py-3 text-center">פעולה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {items.map((it, i) => (
              <tr key={it.slug} className={currentIdx === i ? "bg-cyan-500/5" : ""}>
                <td className="px-4 py-2 text-slate-500 font-mono text-xs">{i + 1}</td>
                <td className="px-4 py-2">
                  <Link href={`/learn/guides/${it.slug}`} className="text-slate-200 hover:text-cyan-400 font-medium">{it.title}</Link>
                  <div className="text-[10px] text-slate-500 font-mono">{it.slug}</div>
                  {it.error && <div className="text-[11px] text-red-400 mt-1">⚠ {it.error}</div>}
                </td>
                <td className="px-4 py-2 text-center text-slate-400">{it.stagesBefore}</td>
                <td className="px-4 py-2 text-center text-slate-400">{it.stagesAfter ?? "—"}</td>
                <td className="px-4 py-2 text-center">
                  <StatusPill status={it.status} took={it.took} />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => enrichSingle(it.slug, i)}
                    disabled={running || it.status === "running"}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded disabled:opacity-40"
                  >
                    ✨
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">טוען…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatBox({ value, label, color }: { value: number; label: string; color: "white" | "slate" | "emerald" | "red" }) {
  const c = {
    white: "text-white",
    slate: "text-slate-300",
    emerald: "text-emerald-300",
    red: "text-red-300",
  }[color];
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`text-3xl font-black ${c}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function StatusPill({ status, took }: { status: Item["status"]; took?: number }) {
  if (status === "pending") return <span className="text-xs text-slate-500">⋯ ממתין</span>;
  if (status === "running") return <span className="text-xs text-cyan-300">🔄 מעשיר…</span>;
  if (status === "done") return <span className="text-xs text-emerald-300">✓ {took ? `${Math.round(took / 1000)}s` : "הושלם"}</span>;
  return <span className="text-xs text-red-300">✗ נכשל</span>;
}
