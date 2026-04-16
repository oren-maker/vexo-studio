"use client";
import { learnFetch } from "@/lib/learn/fetch";
import { useState, useEffect } from "react";

type ProjectSummary = {
  name: string; episodes: number; scenes: number; readyScenes: number;
  characters: number; charsWithGallery: number; totalCostUsd: number;
  totalAiCalls: number; hasOpening: boolean; episodeDetails: { number: number; title: string; scenes: number; status: string }[];
};

export default function SeriesPage() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { loadLatest(); }, []);

  async function loadLatest() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const r = await learnFetch(`/api/v1/learn/brain/refresh?date=${today}`).then((r) => r.json()).catch(() => null);
      if (r?.cache?.seriesAnalysis) {
        setAnalysis(r.cache.seriesAnalysis);
        setProjects(r.cache.productionData ?? []);
        setLastSync(r.cache.date);
      }
    } catch {}
  }

  async function runSync() {
    setSyncing(true); setErr(null);
    try {
      const r = await learnFetch("/api/v1/learn/series-sync", { method: "POST" }).then((r) => r.json());
      if (r.error) throw new Error(r.error);
      setProjects(r.projects ?? []);
      setLastSync(new Date().toISOString().split("T")[0]);
      // Reload analysis
      await loadLatest();
      // If loadLatest didn't get it yet, show a summary
      if (!analysis) setAnalysis(`סונכרנו ${r.synced} פרויקטים. הניתוח נשמר ב-DailyBrainCache.`);
    } catch (e) { setErr((e as Error).message); }
    finally { setSyncing(false); }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">🎬 סדרות — ניתוח מקצועי</h1>
          <p className="text-sm text-slate-400 mt-1">
            המערכת מושכת את כל הנתונים מ-vexo-studio, מנתחת תקציב + התקדמות + איכות, ונותנת הצעות מקצועיות.
          </p>
          {lastSync && <p className="text-xs text-slate-500 mt-1">סנכרון אחרון: {lastSync}</p>}
        </div>
        <button
          onClick={runSync}
          disabled={syncing}
          className="px-4 py-2 rounded-lg bg-cyan-500 text-white font-semibold disabled:opacity-50"
        >
          {syncing ? "🔄 מסנכרן ומנתח…" : "🔄 סנכרן עכשיו"}
        </button>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{err}</div>}

      {/* Quick stats */}
      {projects.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {projects.map((p) => (
            <div key={p.name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
              <div className="text-lg font-bold text-cyan-300">{p.name}</div>
              <div className="text-xs text-slate-400 mt-2 space-y-1">
                <div>📺 {p.episodes} פרקים · {p.scenes} סצנות</div>
                <div>🎭 {p.characters} דמויות ({p.charsWithGallery} עם גלריה)</div>
                <div>💰 ${p.cost ?? p.totalCostUsd}</div>
                <div>{p.hasOpening ? "✅ פתיח" : "⚠️ אין פתיח"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full analysis */}
      {analysis && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">📋 ניתוח מקצועי</h2>
          <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-slate-200">
            {analysis}
          </div>
        </div>
      )}

      {/* Episode breakdown per project */}
      {projects.length > 0 && projects.some((p) => p.episodeDetails?.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">📺 פירוט פרקים</h2>
          {projects.filter((p) => p.episodeDetails?.length > 0).map((p) => (
            <div key={p.name} className="bg-slate-800/30 border border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-700 font-semibold text-cyan-300">{p.name}</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr><th className="px-4 py-2 text-start">#</th><th className="px-4 py-2 text-start">שם</th><th className="px-4 py-2 text-center">סצנות</th><th className="px-4 py-2 text-center">סטטוס</th></tr>
                </thead>
                <tbody>
                  {p.episodeDetails.map((ep) => (
                    <tr key={ep.number} className="border-t border-slate-800">
                      <td className="px-4 py-2 text-slate-400">EP{String(ep.number).padStart(2, "0")}</td>
                      <td className="px-4 py-2">{ep.title}</td>
                      <td className="px-4 py-2 text-center">{ep.scenes}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ep.status === "PUBLISHED" ? "bg-green-500/20 text-green-300" :
                          ep.status === "DRAFT" ? "bg-slate-500/20 text-slate-300" :
                          "bg-yellow-500/20 text-yellow-300"
                        }`}>{ep.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {!analysis && !syncing && projects.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-5xl mb-3">🎬</div>
          <div>לחץ &quot;סנכרן עכשיו&quot; כדי למשוך את כל הנתונים ולקבל ניתוח מקצועי</div>
        </div>
      )}
    </div>
  );
}
