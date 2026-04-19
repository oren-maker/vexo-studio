"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type SceneCheck = { sceneId: string; sceneNumber: number; title: string | null; status: string; hasScript: boolean; hasSummary: boolean; hasFrames: boolean; hasDirectorSheet: boolean; hasSoundNotes: boolean; hasCriticReview: boolean; hasBridgeFrame: boolean; isApproved: boolean };
type Todo = { kind: string; label: string; sceneId?: string; sceneNumber?: number; priority: 1 | 2 | 3 };
type Payload = {
  episode: { id: string; episodeNumber: number; title: string; status: string; seriesTitle: string | null };
  metrics: { sceneCount: number; approved: number; withScripts: number; withFrames: number; withDirectorSheet: number; overallPct: number; hasThumbnail: boolean; hasRecap: boolean };
  sceneChecks: SceneCheck[];
  todos: Todo[];
};

export function EpisodeCompletionPanel({ episodeId, he = true }: { episodeId: string; he?: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setData(await api<Payload>(`/api/v1/episodes/${episodeId}/completion`)); }
    catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); }, [episodeId]);

  if (err) return <div className="text-xs text-rose-400">{err}</div>;
  if (!data) return <div className="text-xs text-slate-500">{he ? "טוען checklist…" : "Loading checklist…"}</div>;

  const m = data.metrics;
  const priorityColors = { 1: "border-rose-500/40 text-rose-300", 2: "border-amber-500/40 text-amber-300", 3: "border-slate-600 text-slate-400" };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-400">{he ? "התקדמות פרק" : "Episode progress"}</div>
          <div className="text-xl font-bold text-cyan-400 num">{m.overallPct}%</div>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all" style={{ width: `${m.overallPct}%` }} />
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-[11px]">
          <Metric label={he ? "סצנות" : "scenes"} value={m.sceneCount} />
          <Metric label={he ? "מאושר" : "approved"} value={`${m.approved}/${m.sceneCount}`} />
          <Metric label="script" value={`${m.withScripts}/${m.sceneCount}`} />
          <Metric label="frames" value={`${m.withFrames}/${m.sceneCount}`} />
          <Metric label="thumb" value={m.hasThumbnail ? "✓" : "—"} />
          <Metric label="recap" value={m.hasRecap ? "✓" : "—"} />
        </div>
      </div>

      {data.todos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-2">{he ? `${data.todos.length} משימות פתוחות` : `${data.todos.length} open todos`}</h3>
          <ul className="space-y-1.5">
            {data.todos.slice(0, 15).map((t, i) => (
              <li key={i} className={`border rounded-lg px-3 py-2 text-xs ${priorityColors[t.priority]}`}>
                {t.sceneId ? (
                  <Link href={`/scenes/${t.sceneId}`} className="block hover:underline">{t.label}</Link>
                ) : (
                  <span>{t.label}</span>
                )}
              </li>
            ))}
            {data.todos.length > 15 && (
              <li className="text-[11px] text-slate-500 text-center pt-1">+{data.todos.length - 15} {he ? "עוד" : "more"}</li>
            )}
          </ul>
        </div>
      )}

      {data.todos.length === 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center text-sm text-emerald-300">
          ✓ {he ? "הפרק מלא — כל הצ'קליסט סומנה" : "Episode complete — every checklist item ticked"}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-950/60 rounded p-2 text-center">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className="font-bold num text-slate-100">{value}</div>
    </div>
  );
}
