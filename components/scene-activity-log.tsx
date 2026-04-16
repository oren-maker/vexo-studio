"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type SceneLog = {
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
};

function actorLabel(actor: string, name: string | null): string {
  if (actor.startsWith("ai:")) return name || `🤖 ${actor.slice(3)}`;
  if (actor === "system:backfill") return "⚙ מילוי רטרואקטיבי";
  if (actor === "system:poll") return name || "⚙ מערכת";
  if (actor.startsWith("user:")) return name || "👤 משתמש";
  return name || "⚙ מערכת";
}

const SORA_RATE: Record<string, number> = { "sora-2": 0.10, "sora-2-pro": 0.30 };
const GROQ_ACTIONS = new Set(["critic_review", "sound_notes_generated", "remix_suggest", "director_sheet_generated", "breakdown_generated", "dialogue_generated", "lipsync_generated", "music_generated"]);

function formatCost(action: string, details: any): string | null {
  if (!details) {
    if (GROQ_ACTIONS.has(action)) return "$0.003";
    return null;
  }
  const usd = details.estimateUsd ?? details.costUsd ?? details.unitCost ?? null;
  if (typeof usd === "number" && usd > 0) return `$${usd.toFixed(usd >= 0.01 ? 2 : 4)}`;
  // Infer from model + duration for video entries
  if (details.model && details.durationSeconds) {
    const rate = SORA_RATE[details.model as string] ?? 0.10;
    const cost = rate * Number(details.durationSeconds);
    if (cost > 0) return `$${cost.toFixed(2)}`;
  }
  // Groq text-AI calls have no explicit cost in details — use flat estimate
  if (GROQ_ACTIONS.has(action)) return "$0.003";
  return null;
}

function formatDetails(action: string, d: any): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.model) parts.push(d.model);
  if (d.durationSeconds) parts.push(`${d.durationSeconds}s`);
  if (d.provider) parts.push(d.provider);
  if (d.score != null) parts.push(`ציון: ${(d.score * 100).toFixed(0)}%`);
  if (d.wordCount) parts.push(`${d.wordCount} מילים`);
  if (d.preview) parts.push(`"${String(d.preview).slice(0, 80)}…"`);
  if (d.feedbackPreview) parts.push(`"${String(d.feedbackPreview).slice(0, 80)}…"`);
  if (d.promptPreview) parts.push(`"${String(d.promptPreview).slice(0, 80)}…"`);
  if (d.framesGenerated) parts.push(`${d.framesGenerated} פריימים`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function SceneActivityLog({ sceneId }: { sceneId: string }) {
  const [logs, setLogs] = useState<SceneLog[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ logs: SceneLog[] }>(`/api/v1/scenes/${sceneId}/log`)
      .then((d) => setLogs(d.logs))
      .catch((e) => setErr(e?.message || String(e)));
  }, [sceneId]);

  if (err) return <div className="text-xs text-red-400">⚠ {err}</div>;
  if (!logs) return <div className="text-xs text-text-muted">טוען...</div>;
  if (logs.length === 0) return <div className="text-xs text-text-muted">אין פעילות עדיין בסצנה זו.</div>;

  return (
    <div translate="no" className="notranslate">
      <h3 className="text-sm font-semibold text-text-primary mb-3">📜 יומן פעילות הסצנה</h3>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pe-1">
        {logs.map((log) => {
          const d = log.details || {};
          const cost = formatCost(log.action, d);
          const detail = formatDetails(log.action, d);
          return (
            <div key={log.id} className="bg-bg-card border border-bg-main rounded-lg px-3 py-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-text-primary">{ACTION_LABEL[log.action] || log.action}</span>
                <div className="flex items-center gap-2">
                  {cost && <span className="font-bold text-accent num">{cost}</span>}
                  <span className="text-text-muted text-[10px] font-mono">{new Date(log.createdAt).toLocaleString("he-IL")}</span>
                </div>
              </div>
              <div className="text-text-muted flex items-center gap-1">
                {log.actor.startsWith("ai:") || log.actor.startsWith("system:") ? "🤖" : "👤"} {actorLabel(log.actor, log.actorName)}
              </div>
              {detail && <div className="text-text-muted mt-1 text-[10px]">{detail}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
