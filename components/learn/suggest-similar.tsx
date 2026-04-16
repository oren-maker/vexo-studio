"use client";

import { useState } from "react";
import SyncProgress from "@/components/learn/sync-progress";
import { saveComposedAction } from "@/app/learn/compose/actions";
import { adminHeaders } from "@/lib/learn/admin-key";

type Item = { prompt: string; rationale: string; similar: Array<{ id: string; title: string | null }> };

export default function SuggestSimilar({ sourceId, sourceTitle }: { sourceId: string; sourceTitle?: string | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Map<number, string>>(new Map());

  async function generate() {
    setErr(""); setItems([]); setSavedIds(new Map()); setActiveTab(0); setStarting(true);
    try {
      const res = await fetch("/api/v1/learn/suggest-similar", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ sourceId, count: 3 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setJobId(j.jobId);
    } catch (e: any) {
      setErr(e.message || "שגיאה");
    } finally {
      setStarting(false);
    }
  }

  async function saveItem(i: number) {
    setSaving(i);
    const it = items[i];
    const r = await saveComposedAction({
      prompt: it.prompt,
      brief: `variation of ${sourceTitle || sourceId}`,
      parentSourceId: sourceId,
      lineageNotes: it.rationale,
      addedBy: "variation",
    });
    setSaving(null);
    if (r.ok) {
      const next = new Map(savedIds);
      next.set(i, r.id);
      setSavedIds(next);
    } else {
      setErr(r.error);
    }
  }

  const pending = starting || !!jobId;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">הצע 3 פרומפטים דומים</h2>
        <button
          onClick={generate}
          disabled={pending}
          className="bg-purple-500 hover:bg-purple-400 text-white font-medium px-4 py-1.5 rounded-lg text-xs disabled:opacity-50"
        >
          {pending ? "🔄 מחולל…" : "✨ חולל וריאציות"}
        </button>
      </div>

      {jobId && (
        <SyncProgress
          jobId={jobId}
          steps={[
            "טוען פרומפטים דומים מהמאגר",
            "מחולל וריאציה 1/3",
            "מחולל וריאציה 2/3",
            "מחולל וריאציה 3/3",
            "הושלם",
          ]}
          onComplete={(result) => {
            setJobId(null);
            if (result?.items?.length) { setItems(result.items); setActiveTab(0); }
            else setErr("לא התקבלו וריאציות (ייתכן quota)");
          }}
          onFailed={(e) => { setJobId(null); setErr(e); }}
        />
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-2 text-xs mt-3">⚠ {err}</div>}

      {items.length > 0 && (
        <div className="mt-3">
          {/* Tabs */}
          <div className="flex gap-1 mb-3 bg-slate-950/40 border border-slate-800 rounded-lg p-1">
            {items.map((_, i) => {
              const isActive = activeTab === i;
              const isSaved = savedIds.has(i);
              return (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition flex items-center justify-center gap-2 ${
                    isActive
                      ? "bg-purple-500 text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <span>וריאציה {i + 1}</span>
                  {isSaved && <span className="text-emerald-300">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Active variation */}
          {(() => {
            const i = activeTab;
            const it = items[i];
            if (!it) return null;
            const savedId = savedIds.get(i);
            return (
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase text-purple-400 font-semibold">וריאציה {i + 1} מתוך {items.length}</span>
                    <span className="text-[10px] text-slate-500">·  {it.prompt.split(/\s+/).length} מילים</span>
                  </div>
                  {savedId ? (
                    <a href={`/learn/sources/${savedId}`} className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium px-2 py-1 rounded hover:bg-emerald-500/30">
                      ✓ נשמר · פתח ←
                    </a>
                  ) : (
                    <button
                      onClick={() => saveItem(i)}
                      disabled={saving === i}
                      className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium px-2 py-1 rounded disabled:opacity-50"
                    >
                      {saving === i ? "שומר..." : "💾 שמור למקור"}
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-100 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto" dir="ltr">
                  {it.prompt}
                </div>
                {it.rationale && (
                  <div className="mt-2 text-[11px] text-slate-400 italic">💡 {it.rationale}</div>
                )}
              </div>
            );
          })()}

          {/* Prev/Next nav */}
          {items.length > 1 && (
            <div className="flex justify-between items-center mt-3">
              <button
                onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
                disabled={activeTab === 0}
                className="text-xs text-slate-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded border border-slate-700 bg-slate-900/50"
              >
                ← הקודם
              </button>
              <span className="text-[10px] text-slate-500 font-mono">{activeTab + 1} / {items.length}</span>
              <button
                onClick={() => setActiveTab((t) => Math.min(items.length - 1, t + 1))}
                disabled={activeTab === items.length - 1}
                className="text-xs text-slate-400 hover:text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded border border-slate-700 bg-slate-900/50"
              >
                הבא →
              </button>
            </div>
          )}
        </div>
      )}

      {!pending && items.length === 0 && !err && (
        <p className="text-xs text-slate-500 mt-2">לחץ על הכפתור כדי לבקש מ-Gemini לחולל 3 וריאציות על בסיס הפרומפט הזה + 5 דומים לו מהמערכת. כל וריאציה שתשמור תקושר למקור הזה אוטומטית.</p>
      )}
    </div>
  );
}
