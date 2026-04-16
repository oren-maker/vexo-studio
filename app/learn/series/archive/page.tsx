"use client";
import { learnFetch } from "@/lib/learn/fetch";
import Link from "next/link";
import { useState, useEffect } from "react";

type ProjectSummary = {
  name: string; episodes: number; scenes: number; readyScenes: number;
  characters: number; charsWithGallery: number; totalCostUsd: number;
  hasOpening: boolean;
  episodeDetails: { number: number; title: string; scenes: number; status: string }[];
};
type Delta = { period?: string; learnings?: string[]; sourcesAdded?: number; nodesAdded?: number; seriesChanges?: { name: string; scenesDelta: number; costDelta: number; readyDelta: number }[] };
type Snapshot = { id: string; takenAt: string; summary: string | null; data: ProjectSummary[] | null; delta: Delta | null };

const PAGE_SIZE = 20;

export default function SeriesArchivePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    learnFetch("/api/v1/learn/series-history").then((r) => r.json()).then((d) => {
      setSnapshots((d.snapshots ?? []).map((s: any) => ({ id: s.id, takenAt: s.takenAt, summary: s.summary, data: s.data, delta: s.delta })));
    }).catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(snapshots.length / PAGE_SIZE));
  const paged = snapshots.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <header>
        <Link href="/learn/series" className="text-xs text-slate-400 hover:text-cyan-400">← חזרה לסדרות</Link>
        <h1 className="text-3xl font-bold mt-1">📁 ארכיון סנכרונים</h1>
        <p className="text-sm text-slate-400 mt-1">{snapshots.length} סנכרונים נשמרו. לחץ על שורה לפתוח את הסקירה.</p>
      </header>

      <div className="space-y-2">
        {paged.map((s) => {
          const projects: ProjectSummary[] = (s.data as any) ?? [];
          const isOpen = expanded === s.id;
          return (
            <div key={s.id} className="border border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : s.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-800/50 transition"
              >
                <span className="text-slate-300 font-mono">{new Date(s.takenAt).toLocaleString("he-IL")}</span>
                <span className="text-xs text-slate-500">
                  {projects.length} פרויקטים · {projects.reduce((a, p) => a + p.episodes, 0)} פרקים · {projects.reduce((a, p) => a + p.scenes, 0)} סצנות
                  <span className="ms-2">{isOpen ? "▲" : "▼"}</span>
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-slate-800 space-y-3">
                  {/* Delta — what changed since previous sync */}
                  {s.delta?.learnings && s.delta.learnings.length > 0 && (
                    <div className="mt-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
                      <div className="text-xs font-semibold text-cyan-300 mb-2">📈 מה השתנה {s.delta.period ? `(${s.delta.period})` : ""}</div>
                      <ul className="space-y-1">
                        {s.delta.learnings.map((l, i) => (
                          <li key={i} className="text-sm text-slate-200 flex items-start gap-2">
                            <span className="text-cyan-400 mt-0.5">•</span>
                            <span>{l}</span>
                          </li>
                        ))}
                      </ul>
                      {s.delta.seriesChanges && s.delta.seriesChanges.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-cyan-500/10 grid grid-cols-2 gap-2 text-xs">
                          {s.delta.seriesChanges.map((sc) => (
                            <div key={sc.name} className="text-slate-400">
                              <span className="text-slate-200 font-semibold">{sc.name}:</span>{" "}
                              {sc.scenesDelta !== 0 && <span>{sc.scenesDelta > 0 ? "+" : ""}{sc.scenesDelta} סצנות · </span>}
                              {sc.readyDelta !== 0 && <span>{sc.readyDelta > 0 ? "+" : ""}{sc.readyDelta} מוכנות · </span>}
                              {sc.costDelta !== 0 && <span>{sc.costDelta > 0 ? "+" : ""}${sc.costDelta}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {s.summary && (
                    <div className="text-sm text-slate-200 whitespace-pre-wrap mt-3 leading-relaxed bg-slate-900/40 rounded-lg p-3">{s.summary}</div>
                  )}
                  {projects.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {projects.map((p) => (
                        <div key={p.name} className="bg-slate-800/40 rounded-lg p-3 text-xs space-y-1">
                          <div className="font-bold text-cyan-300">{p.name}</div>
                          <div>📺 {p.episodes} פרקים · {p.scenes} סצנות</div>
                          <div>🎭 {p.characters} דמויות · 💰 ${p.totalCostUsd}</div>
                          <div>{p.hasOpening ? "✅ פתיח" : "⚠️ חסר פתיח"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-3">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-30">הקודם</button>
          <span className="text-xs text-slate-400">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-30">הבא</button>
        </div>
      )}
    </div>
  );
}
