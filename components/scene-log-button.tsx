"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Log = {
  id: string;
  sceneId: string;
  action: string;
  actor: string;
  actorName: string | null;
  details: any;
  createdAt: string;
};

const ACTION_LABEL: Record<string, string> = {
  script_updated: "📝 תסריט עודכן",
  script_overwritten: "🔄 תסריט שוכתב",
  status_changed: "🔄 סטטוס",
  prompt_added: "✨ פרומפט נוסף",
  video_generated: "🎬 וידאו נוצר",
  image_generated: "🖼 תמונה נוצרה",
};

export default function SceneLogButton({ sceneId }: { sceneId: string }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function openLog() {
    setOpen(true);
    if (logs !== null) return;
    try {
      const d = await api<{ logs: Log[] }>(`/api/v1/scenes/${sceneId}/log`);
      setLogs(d.logs);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <>
      <button
        onClick={openLog}
        className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-semibold"
        title="יומן פעילות הסצנה"
      >
        📜 לוג
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-bg-card rounded-card shadow-card border border-bg-main w-full max-w-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
            <div className="px-5 py-3 border-b border-bg-main flex items-center justify-between">
              <div className="font-semibold">📜 יומן פעילות הסצנה</div>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" dir="rtl">
              {err && <div className="text-red-400 text-xs">⚠ {err}</div>}
              {!logs && !err && <div className="text-text-muted text-sm">טוען...</div>}
              {logs && logs.length === 0 && <div className="text-text-muted text-sm">אין פעילות עדיין בסצנה זו.</div>}
              {logs?.map((log) => {
                const d = log.details || {};
                return (
                  <div key={log.id} className="bg-bg-main/40 border border-bg-main rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{ACTION_LABEL[log.action] || log.action}</span>
                      <span className="text-text-muted text-[10px] font-mono">{new Date(log.createdAt).toLocaleString("he-IL")}</span>
                    </div>
                    <div className="text-text-muted">
                      {log.actor.startsWith("ai:") ? "🤖" : "👤"} {log.actorName || log.actor}
                    </div>
                    {d.brief && <div className="text-text-muted mt-1 italic">&ldquo;{String(d.brief).slice(0, 120)}&rdquo;</div>}
                    {d.wordCount && <div className="text-text-muted mt-0.5">{d.wordCount} מילים · {d.previousLength ? `${d.previousLength}→${d.newLength}` : d.newLength} תווים</div>}
                    {d.reason && <div className="text-[10px] text-accent mt-0.5">{d.reason}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
