"use client";
import { learnFetch } from "@/lib/learn/fetch";
import { useState, useEffect } from "react";

type ProjectSummary = {
  name: string; episodes: number; scenes: number; readyScenes: number;
  characters: number; charsWithGallery: number; totalCostUsd: number;
  totalAiCalls: number; hasOpening: boolean;
  episodeDetails: { number: number; title: string; scenes: number; status: string }[];
};

type Snapshot = { id: string; takenAt: string; summary: string | null; data: ProjectSummary[] | null };

export default function SeriesPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<Snapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");
  const [syncPct, setSyncPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function loadHistory() {
    try {
      const r = await learnFetch("/api/v1/learn/series-history").then((r) => r.json());
      const list: Snapshot[] = (r.snapshots ?? []).map((s: any) => ({
        id: s.id, takenAt: s.takenAt, summary: s.summary, data: s.data,
      }));
      setSnapshots(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch {}
  }
  useEffect(() => { loadHistory(); }, []);

  async function runSync() {
    setSyncing(true); setErr(null); setSyncPct(0);
    try {
      setSyncPct(10); setSyncStage("📊 מושך פרויקטים, סדרות, עונות…");
      await new Promise((r) => setTimeout(r, 200));
      setSyncPct(30); setSyncStage("📺 מושך פרקים וסצנות…");
      await new Promise((r) => setTimeout(r, 200));
      setSyncPct(50); setSyncStage("📊 מחשב סיכום…");

      const r = await learnFetch("/api/v1/learn/series-sync", { method: "POST" }).then((r) => r.json());
      if (r.error) throw new Error(r.error ?? r.message);

      setSyncPct(90); setSyncStage("💾 שומר…");
      await new Promise((r) => setTimeout(r, 200));

      setSyncPct(100); setSyncStage("✅ הושלם!");
      await loadHistory();
      setTimeout(() => { setSyncPct(0); setSyncStage(""); }, 1500);
    } catch (e) { setErr((e as Error).message); setSyncStage(""); setSyncPct(0); }
    finally { setSyncing(false); }
  }

  const projects: ProjectSummary[] = (selected?.data as any) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">🎬 סדרות — ניתוח מקצועי</h1>
          <p className="text-sm text-slate-400 mt-1">סנכרון נתוני הפקה + ניתוח מקצועי. כל ריצה נשמרת בארכיון.</p>
        </div>
        <button onClick={runSync} disabled={syncing} className="px-4 py-2 rounded-lg bg-cyan-500 text-white font-semibold disabled:opacity-50">
          {syncing ? "🔄 מסנכרן…" : "🔄 סנכרן עכשיו"}
        </button>
      </header>

      {/* Progress */}
      {syncing && syncStage && (
        <div className="bg-slate-800/60 border border-cyan-500/30 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm"><span>{syncStage}</span><span className="text-cyan-300 font-bold">{syncPct}%</span></div>
          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
            <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${syncPct}%` }} />
          </div>
        </div>
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{err}</div>}

      {/* Archive link */}
      {snapshots.length > 1 && (
        <a href="/learn/series/archive" className="text-xs text-slate-400 hover:text-cyan-300 border border-slate-700 rounded-lg px-3 py-1.5 inline-block">
          📁 ארכיון ({snapshots.length - 1})
        </a>
      )}

      {/* Stats cards */}
      {projects.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {projects.map((p) => (
            <div key={p.name} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
              <div className="text-lg font-bold text-cyan-300">{p.name}</div>
              <div className="text-xs text-slate-400 mt-2 space-y-1">
                <div>📺 {p.episodes} פרקים · {p.scenes} סצנות</div>
                <div>🎭 {p.characters} דמויות ({p.charsWithGallery} עם גלריה)</div>
                <div>💰 ${p.totalCostUsd}</div>
                <div>{p.hasOpening ? "✅ פתיח" : "⚠️ חסר פתיח"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {selected?.summary && (
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-5">
          <h2 className="text-lg font-bold mb-3">📋 סיכום</h2>
          <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{selected.summary}</div>
        </div>
      )}

      {/* Episode breakdown */}
      {projects.some((p) => p.episodeDetails?.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">📺 פירוט פרקים</h2>
          {projects.filter((p) => p.episodeDetails?.length > 0).map((p) => (
            <div key={p.name} className="bg-slate-800/30 border border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-700 font-semibold text-cyan-300">{p.name}</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase"><tr><th className="px-4 py-2 text-start">#</th><th className="px-4 py-2 text-start">שם</th><th className="px-4 py-2 text-center">סצנות</th><th className="px-4 py-2 text-center">סטטוס</th></tr></thead>
                <tbody>
                  {p.episodeDetails.map((ep) => (
                    <tr key={ep.number} className="border-t border-slate-800">
                      <td className="px-4 py-2 text-slate-400" data-no-translate>{String(ep.number).padStart(2, "0")}</td>
                      <td className="px-4 py-2">{ep.title}</td>
                      <td className="px-4 py-2 text-center">{ep.scenes}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ep.status === "PUBLISHED" ? "bg-green-500/20 text-green-300" : ep.status === "DRAFT" ? "bg-slate-500/20 text-slate-300" : "bg-yellow-500/20 text-yellow-300"}`}>{ep.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {snapshots.length === 0 && !syncing && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-5xl mb-3">🎬</div>
          <div>לחץ &quot;סנכרן עכשיו&quot; כדי למשוך את כל הנתונים</div>
        </div>
      )}
    </div>
  );
}
