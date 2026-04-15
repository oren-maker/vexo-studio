"use client";

import { useState } from "react";
import Link from "next/link";
import SyncProgress from "@/components/learn/sync-progress";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";

type Result = {
  id: string;
  title: string | null;
  promptHead: string;
  thumbnail: string | null;
  addedBy: string | null;
  userRating: number | null;
  score: number;
};

export default function SemanticSearchClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [totalCorpus, setTotalCorpus] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [backfillJobId, setBackfillJobId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true); setErr("");
    try {
      const res = await fetch("/api/learn/search/semantic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 20 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "search failed");
      setResults(j.results);
      setTotalCorpus(j.totalCorpus);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setSearching(false);
    }
  }

  async function runBackfill(force: boolean) {
    if (!getAdminKey()) { setErr("הגדר admin key ב-/admin"); return; }
    if (!confirm(`Backfill ${force ? "כולל מקורות שכבר embedded" : "רק חדשים"} — להמשיך?`)) return;
    setErr("");
    try {
      const res = await fetch("/api/learn/embeddings/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ force }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "backfill failed");
      setBackfillJobId(j.jobId);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="לדוגמה: cinematic drone shot of a city at sunset"
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
            dir="auto"
          />
          <button
            onClick={search}
            disabled={searching || query.trim().length < 2}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {searching ? "🔄 מחפש…" : "🔍 חפש"}
          </button>
        </div>
        {totalCorpus !== null && (
          <div className="text-[11px] text-slate-500 mt-2">
            🧠 {totalCorpus} פרומפטים embedded במאגר
          </div>
        )}
      </div>

      <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-3 flex gap-2 flex-wrap items-center">
        <span className="text-xs text-slate-500">ניהול embeddings:</span>
        <button onClick={() => runBackfill(false)} className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 px-3 py-1.5 rounded">
          📥 Backfill חדשים בלבד
        </button>
        <button onClick={() => runBackfill(true)} className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded">
          🔄 Re-embed הכל (force)
        </button>
      </div>

      {backfillJobId && (
        <SyncProgress
          jobId={backfillJobId}
          steps={["מחשב embeddings", "הושלם"]}
          onComplete={() => { setBackfillJobId(null); setTimeout(() => window.location.reload(), 1000); }}
          onFailed={(e) => { setBackfillJobId(null); setErr(e); }}
        />
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-3 text-sm">⚠ {err}</div>}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <Link
              key={r.id}
              href={`/learn/sources/${r.id}`}
              className="flex gap-3 items-start bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 rounded-lg p-3 transition"
            >
              <div className="text-2xl font-black text-cyan-300 w-10 text-center">#{i + 1}</div>
              {r.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnail} alt="" className="w-20 h-12 object-cover rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{r.title || "(ללא כותרת)"}</div>
                <div className="text-xs text-slate-400 line-clamp-1 mt-0.5" dir="ltr">{r.promptHead}</div>
                <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
                  {r.addedBy && <span>{r.addedBy}</span>}
                  {r.userRating && <span className="text-amber-400">{"★".repeat(r.userRating)}</span>}
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-emerald-300 font-mono text-sm font-bold">{(r.score * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-slate-500">match</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {results.length === 0 && !searching && totalCorpus !== null && (
        <div className="text-center text-slate-500 text-sm py-6">לא נמצאו תוצאות. נסה ניסוח אחר.</div>
      )}
    </div>
  );
}
