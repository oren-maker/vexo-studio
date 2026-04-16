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
type Snapshot = { id: string; takenAt: string; summary: string | null; data: ProjectSummary[] | null };

const PAGE_SIZE = 20;

export default function SeriesArchivePage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    learnFetch("/api/v1/learn/series-history").then((r) => r.json()).then((d) => {
      setSnapshots((d.snapshots ?? []).map((s: any) => ({ id: s.id, takenAt: s.takenAt, summary: s.summary, data: s.data })));
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
