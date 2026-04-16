"use client";
import { learnFetch } from "@/lib/learn/fetch";

import { useState } from "react";
import SyncProgress from "./sync-progress";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";

function formatNextRun(): { nextAt: Date; inText: string } {
  // Daily cron at 06:00 UTC (vercel.json: "0 6 * * *")
  const now = new Date();
  const nextAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0));
  if (nextAt.getTime() <= now.getTime()) nextAt.setUTCDate(nextAt.getUTCDate() + 1);
  const deltaMs = nextAt.getTime() - now.getTime();
  const hours = Math.floor(deltaMs / 3600_000);
  const mins = Math.floor((deltaMs % 3600_000) / 60_000);
  const inText = hours > 0 ? `בעוד ${hours} שעות ו-${mins} דקות` : `בעוד ${mins} דקות`;
  return { nextAt, inText };
}

export default function BrainRefreshButton({ lastRunAt }: { lastRunAt?: Date | string | null }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");
  const lastAt = lastRunAt ? new Date(lastRunAt) : null;
  const { nextAt, inText } = formatNextRun();

  async function run() {
    if (!getAdminKey()) { setErr("הגדר admin key ב-/admin"); return; }
    if (!confirm("Gemini 2.5 Pro יחבר זהות חדשה ליום (~$0.005). להמשיך?")) return;
    setErr(""); setStarting(true);
    try {
      const res = await learnFetch("/api/v1/learn/brain/refresh", { method: "POST", headers: adminHeaders() });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setJobId(j.jobId);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setStarting(false);
    }
  }

  const pending = starting || !!jobId;

  return (
    <div className="flex flex-col items-stretch gap-2 min-w-[200px]">
      <button
        onClick={run}
        disabled={pending}
        className="bg-gradient-to-l from-purple-500 to-cyan-500 hover:opacity-90 text-white font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "🔄 חושב…" : "🔄 רענן זהות עכשיו"}
      </button>
      <div className="flex flex-col gap-0.5 text-[10px] leading-tight">
        <span className="text-slate-500">
          ⏮ אחרון: <span className="text-slate-300 font-mono">{lastAt ? lastAt.toLocaleString("he-IL") : "אף פעם"}</span>
        </span>
        <span className="text-slate-500">
          ⏭ הבא: <span className="text-cyan-300 font-mono">{nextAt.toLocaleString("he-IL")}</span> <span className="text-slate-500">· {inText}</span>
        </span>
      </div>
      {jobId && (
        <SyncProgress
          jobId={jobId}
          steps={["אוסף נתונים מהמאגר", "Gemini Pro מחבר זהות יומית", "הושלם"]}
          onComplete={() => { setTimeout(() => window.location.reload(), 1000); }}
          onFailed={(e) => { setJobId(null); setErr(e); }}
        />
      )}
      {err && <span className="text-[11px] text-red-400">⚠ {err}</span>}
    </div>
  );
}
