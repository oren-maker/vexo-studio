"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";

type Job = {
  id: string;
  sourceId: string;
  model: string;
  usdCost: number;
  durationSec: number;
  aspectRatio: string;
  error: string | null;
  promptHead: string;
  startedAt: string;
  updatedAt: string;
  source: { id: string; title: string | null; prompt: string } | null;
};

export default function FailedJobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retriedSuccess, setRetriedSuccess] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const r = await learnFetch("/api/v1/learn/failed-jobs", { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setJobs(j.jobs);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function retry(id: string) {
    setRetrying(id); setErr(null);
    try {
      const r = await learnFetch("/api/v1/learn/failed-jobs/retry", {
        method: "POST",
        headers: adminHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ videoId: id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRetriedSuccess((s) => new Set(s).add(id));
    } catch (e) { setErr((e as Error).message); }
    finally { setRetrying(null); }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">💥 עבודות שנכשלו</h1>
          <p className="text-sm text-slate-400 mt-1">סרטוני Sora/VEO/Vidu שחזרו עם status=failed. לחיצה על "🔁 נסה שוב" מריצה מחדש את אותו פרומפט עם אותם פרמטרים.</p>
        </div>
        <button onClick={load} className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm">🔄 רענן</button>
      </header>

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{err}</div>}

      {jobs && jobs.length === 0 && (
        <div className="text-center py-12 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <div className="text-5xl mb-3">✅</div>
          <div className="text-emerald-300 font-semibold">אין עבודות שנכשלו</div>
          <div className="text-xs text-slate-400 mt-2">כל ההפקות האחרונות הצליחו</div>
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const retried = retriedSuccess.has(j.id);
            return (
              <li key={j.id} className="bg-slate-900/40 border border-rose-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <Link href={`/learn/sources/${j.sourceId}`} className="font-semibold text-cyan-300 hover:underline">
                      {j.source?.title ?? j.source?.prompt?.slice(0, 60) ?? j.sourceId.slice(-8)}
                    </Link>
                    <div className="text-[11px] text-slate-400 mt-1 font-mono">
                      {j.model} · {j.durationSec}s · {j.aspectRatio} · ${j.usdCost.toFixed(3)}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">{new Date(j.updatedAt).toLocaleString("he-IL")}</div>
                </div>

                {j.error && (
                  <div className="bg-slate-950/60 border border-slate-700 rounded p-2 text-xs text-rose-200 mb-2 font-mono whitespace-pre-wrap">
                    {j.error.slice(0, 400)}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400 line-clamp-1 flex-1">{j.promptHead.slice(0, 120)}…</div>
                  {retried ? (
                    <span className="text-xs text-emerald-300 font-semibold">✓ retry בוצע</span>
                  ) : (
                    <button
                      onClick={() => retry(j.id)}
                      disabled={retrying === j.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold"
                    >
                      {retrying === j.id ? "⏳ מריץ..." : "🔁 נסה שוב"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
