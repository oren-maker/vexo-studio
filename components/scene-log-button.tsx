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
  status_changed: "🔄 סטטוס שונה",
  prompt_added: "✨ פרומפט נוסף",
  video_generated: "🎬 וידאו נשלח ליצירה",
  video_remix: "✨ Remix נשלח",
  video_ready: "✅ וידאו מוכן",
  video_set_primary: "⭐ וידאו נקבע כראשי",
  image_generated: "🖼 תמונה נוצרה",
  critic_review: "🧐 ביקורת AI",
  sound_notes_generated: "🔊 הערות סאונד נוצרו",
  remix_suggest: "🎬 הצעת Remix מהבמאי",
  scene_approved: "✅ סצנה אושרה",
  storyboard_generated: "🖼 תשריט נוצר",
  director_sheet_generated: "🎬 דף במאי נוצר",
  breakdown_generated: "📋 פירוק תסריט",
  dialogue_generated: "💬 דיאלוג נוצר",
  lipsync_generated: "👄 ליפ-סינק נוצר",
  music_generated: "🎵 מוזיקה נוצרה",
  brain_chat: "🧠 שיחה עם הבמאי",
  brain_execute_update_scene: "🤖 הבמאי עדכן סצנה",
  brain_execute_compose_prompt: "🤖 הבמאי יצר פרומפט",
  brain_execute_create_scene: "🤖 הבמאי יצר סצנה",
};

const SORA_RATE: Record<string, number> = { "sora-2": 0.10, "sora-2-pro": 0.30 };
const GROQ_ACTIONS = new Set(["critic_review", "sound_notes_generated", "remix_suggest", "director_sheet_generated", "breakdown_generated", "dialogue_generated", "lipsync_generated", "music_generated"]);

function getCost(action: string, d: any): string | null {
  if (!d && GROQ_ACTIONS.has(action)) return "$0.003";
  if (!d) return null;
  const usd = d.estimateUsd ?? d.costUsd ?? d.unitCost ?? null;
  if (typeof usd === "number" && usd > 0) return `$${usd.toFixed(usd >= 0.01 ? 2 : 4)}`;
  if (d.model && d.durationSeconds) {
    const rate = SORA_RATE[d.model as string] ?? 0.10;
    const cost = rate * Number(d.durationSeconds);
    if (cost > 0) return `$${cost.toFixed(2)}`;
  }
  if (GROQ_ACTIONS.has(action)) return "$0.003";
  return null;
}

function getDetail(d: any): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.model) parts.push(d.model);
  if (d.durationSeconds) parts.push(`${d.durationSeconds}s`);
  if (d.score != null) parts.push(`ציון: ${(d.score * 100).toFixed(0)}%`);
  if (d.wordCount) parts.push(`${d.wordCount} מילים`);
  if (d.framesGenerated) parts.push(`${d.framesGenerated} פריימים`);
  if (d.feedbackPreview) parts.push(String(d.feedbackPreview).slice(0, 80));
  if (d.preview) parts.push(String(d.preview).slice(0, 80));
  if (d.promptPreview) parts.push(String(d.promptPreview).slice(0, 80));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function SceneLogButton({ sceneId, preloaded }: { sceneId: string; preloaded?: Log[] }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<Log[] | null>(preloaded ?? null);
  const [err, setErr] = useState<string | null>(null);

  async function openLog() {
    setOpen(true);
    // Show preloaded/cached instantly, then refresh in background so new actions appear
    try {
      const d = await api<{ logs: Log[] }>(`/api/v1/scenes/${sceneId}/log`);
      setLogs(d.logs);
    } catch (e: any) {
      if (!logs) setErr(e?.message || String(e));
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
          <div
            onClick={(e) => e.stopPropagation()}
            translate="no"
            className="notranslate bg-bg-card rounded-card shadow-card border border-bg-main w-full max-w-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: "85vh" }}
          >
            <div className="px-5 py-3 border-b border-bg-main flex items-center justify-between shrink-0">
              <div className="font-semibold">📜 יומן פעילות הסצנה</div>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-2" dir="rtl" style={{ maxHeight: "calc(85vh - 60px)" }}>
              {err && <div className="text-red-400 text-xs">⚠ {err}</div>}
              {!logs && !err && <div className="text-text-muted text-sm">טוען...</div>}
              {logs && logs.length === 0 && <div className="text-text-muted text-sm">אין פעילות עדיין בסצנה זו.</div>}
              {logs?.map((log) => {
                const d = log.details || {};
                const cost = getCost(log.action, d);
                const detail = getDetail(d);
                return (
                  <div key={log.id} className="bg-bg-main/40 border border-bg-main rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{ACTION_LABEL[log.action] || log.action}</span>
                      <div className="flex items-center gap-2">
                        {cost && <span className="font-bold text-accent num">{cost}</span>}
                        <span className="text-text-muted text-[10px] font-mono">{new Date(log.createdAt).toLocaleString("he-IL")}</span>
                      </div>
                    </div>
                    <div className="text-text-muted">
                      {log.actor.startsWith("ai:") || log.actor.startsWith("system:") ? "🤖" : "👤"} {log.actorName || log.actor}
                    </div>
                    {detail && <div className="text-text-muted mt-1 text-[10px] break-words">{detail}</div>}
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
