"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";

type Issue = {
  kind: "missing_cast" | "appearance_drift";
  sceneId: string;
  episodeNumber: number | null;
  sceneNumber: number;
  seriesTitle: string | null;
  detail: string;
};

type Payload = {
  ok: boolean;
  scannedScenes: number;
  issueCount: number;
  issues: Issue[];
};

export default function InconsistenciesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await learnFetch("/api/v1/learn/insights/consistency", { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const byKind = {
    missing_cast: data?.issues.filter((i) => i.kind === "missing_cast") ?? [],
    appearance_drift: data?.issues.filter((i) => i.kind === "appearance_drift") ?? [],
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">🔍 אי-עקביות בסדרות</h1>
          <p className="text-sm text-slate-400 mt-1">סריקה אוטומטית: שמות בסקריפט שלא בקאסט של הפרק + מאפייני מראה סותרים לאותה דמות</p>
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm disabled:opacity-50">
          {loading ? "סורק..." : "🔄 סרוק מחדש"}
        </button>
      </header>

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{err}</div>}

      {data && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-6 flex-wrap">
          <div><div className="text-xs text-slate-400">סצנות שנסרקו</div><div className="text-2xl font-bold">{data.scannedScenes}</div></div>
          <div><div className="text-xs text-slate-400">אי-עקביות שנמצאו</div><div className={`text-2xl font-bold ${data.issueCount === 0 ? "text-emerald-400" : "text-amber-400"}`}>{data.issueCount}</div></div>
          <div><div className="text-xs text-slate-400">שמות חסרים מקאסט</div><div className="text-2xl font-bold">{byKind.missing_cast.length}</div></div>
          <div><div className="text-xs text-slate-400">drift במראה</div><div className="text-2xl font-bold">{byKind.appearance_drift.length}</div></div>
        </div>
      )}

      {data && data.issueCount === 0 && !loading && (
        <div className="text-center py-12 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <div className="text-5xl mb-3">✅</div>
          <div className="text-emerald-300 font-semibold">הסריקה נקייה — לא נמצאו אי-עקביות</div>
          <div className="text-xs text-slate-400 mt-2">המערכת סורקת סצנות ב-STORYBOARD_APPROVED ומעלה</div>
        </div>
      )}

      {byKind.missing_cast.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-3">👥 שמות בסקריפט שלא בקאסט ({byKind.missing_cast.length})</h2>
          <ul className="space-y-2">
            {byKind.missing_cast.map((i, idx) => (
              <li key={idx} className="bg-slate-900/40 border border-amber-500/30 rounded-lg p-3">
                <Link href={`/scenes/${i.sceneId}`} className="block hover:bg-slate-800/40 -m-3 p-3 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">
                    {i.seriesTitle && <span>{i.seriesTitle} · </span>}
                    <span className="font-mono">EP{String(i.episodeNumber ?? 0).padStart(2, "0")} · SC{String(i.sceneNumber).padStart(2, "0")}</span>
                  </div>
                  <div className="text-sm text-slate-200">{i.detail}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {byKind.appearance_drift.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-3">🎭 drift במראה ({byKind.appearance_drift.length})</h2>
          <ul className="space-y-2">
            {byKind.appearance_drift.map((i, idx) => (
              <li key={idx} className="bg-slate-900/40 border border-rose-500/30 rounded-lg p-3">
                <Link href={`/scenes/${i.sceneId}`} className="block hover:bg-slate-800/40 -m-3 p-3 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">
                    {i.seriesTitle && <span>{i.seriesTitle} · </span>}
                    <span className="font-mono">EP{String(i.episodeNumber ?? 0).padStart(2, "0")} · SC{String(i.sceneNumber).padStart(2, "0")}</span>
                  </div>
                  <div className="text-sm text-slate-200">{i.detail}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
