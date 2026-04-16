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
  video_generated: "🎬 וידאו נוצר",
  image_generated: "🖼 תמונה נוצרה",
};

function actorLabel(actor: string, name: string | null): string {
  if (actor.startsWith("ai:")) return name || `🤖 ${actor.slice(3)}`;
  if (actor.startsWith("user:")) return name || "👤 משתמש";
  return "⚙ system";
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
  if (!logs) return <div className="text-xs text-text-muted">טוען יומן...</div>;
  if (logs.length === 0) return <div className="text-xs text-text-muted">אין פעילות עדיין.</div>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary mb-3">📜 יומן פעילות ({logs.length})</h3>
      {logs.map((log) => {
        const d = log.details || {};
        return (
          <div key={log.id} className="bg-bg-card border border-bg-main rounded-lg px-3 py-2 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-text-primary">{ACTION_LABEL[log.action] || log.action}</span>
              <span className="text-text-muted text-[10px] font-mono">{new Date(log.createdAt).toLocaleString("he-IL")}</span>
            </div>
            <div className="text-text-muted">
              {log.actor.startsWith("ai:") ? "🤖" : "👤"} {actorLabel(log.actor, log.actorName)}
            </div>
            {d.brief && <div className="text-text-muted mt-1 italic">"{String(d.brief).slice(0, 100)}"</div>}
            {d.wordCount && <div className="text-text-muted mt-0.5">{d.wordCount} מילים · {d.previousLength ? `${d.previousLength}→${d.newLength} תווים` : `${d.newLength} תווים`}</div>}
            {d.reason && <div className="text-[10px] text-accent mt-0.5">{d.reason}</div>}
          </div>
        );
      })}
    </div>
  );
}
