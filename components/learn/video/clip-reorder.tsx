"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminHeaders } from "@/lib/learn/admin-key";

type Clip = { id: string; filename: string; durationSec: number | null; order: number };

export default function ClipReorder({ jobId, initialClips }: { jobId: string; initialClips: Clip[] }) {
  const router = useRouter();
  const [clips, setClips] = useState<Clip[]>(initialClips);
  const [editing, setEditing] = useState(false);
  const [saving, startSaving] = useTransition();
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, dir: -1 | 1) {
    const next = [...clips];
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= next.length) return;
    [next[index], next[newIdx]] = [next[newIdx], next[index]];
    setClips(next.map((c, i) => ({ ...c, order: i })));
  }

  async function saveOrder() {
    setError(null);
    startSaving(async () => {
      try {
        const res = await fetch(`/api/v1/learn/video/jobs/${jobId}`, {
          method: "PATCH",
          headers: adminHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            clips: clips.map((c, i) => ({ id: c.id, order: i })),
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        setEditing(false);
        router.refresh();
      } catch (e: any) {
        setError(String(e.message || e));
      }
    });
  }

  async function rerun() {
    if (!confirm("לרנדר מחדש לפי הסדר החדש? הסרטון הקיים יוחלף.")) return;
    setRendering(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/learn/video/jobs/${jobId}/run`, {
        method: "POST",
        headers: adminHeaders({ "content-type": "application/json" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setRendering(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white">קליפים בפרויקט ({clips.length})</h2>
        <div className="flex gap-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded font-semibold"
            >
              ✏️ ערוך סדר
            </button>
          ) : (
            <>
              <button
                onClick={saveOrder}
                disabled={saving}
                className="text-xs bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold px-3 py-1.5 rounded"
              >
                {saving ? "⏳ שומר..." : "✅ שמור"}
              </button>
              <button
                onClick={() => { setClips(initialClips); setEditing(false); }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded"
              >
                ❌ ביטול
              </button>
              <button
                onClick={rerun}
                disabled={rendering || saving}
                className="text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold px-3 py-1.5 rounded"
              >
                {rendering ? "⏳ מרנדר..." : "🎬 רנדר מחדש"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-3">{error}</div>
      )}

      <ul className="space-y-2">
        {clips.map((c, i) => (
          <li
            key={c.id}
            className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-sm flex items-center gap-3"
          >
            <span className="text-cyan-300 font-mono w-6">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-white truncate">{c.filename}</div>
              {c.durationSec && (
                <div className="text-[11px] text-slate-500 mt-0.5">{c.durationSec.toFixed(1)}s</div>
              )}
            </div>
            {editing && (
              <div className="flex gap-1">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="w-7 h-7 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700 rounded text-sm flex items-center justify-center"
                  title="הזז למעלה"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === clips.length - 1}
                  className="w-7 h-7 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700 rounded text-sm flex items-center justify-center"
                  title="הזז למטה"
                >
                  ▼
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
