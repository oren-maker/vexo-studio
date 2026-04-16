"use client";
import { learnFetch } from "@/lib/learn/fetch";

import { useState } from "react";
import Link from "next/link";
import SyncProgress from "./sync-progress";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";

export default function RegenerateFromUrlButton({ sourceId, hasUrl }: { sourceId: string; hasUrl: boolean }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    if (!getAdminKey()) {
      setErr("NEED_KEY");
      return;
    }
    if (!confirm("זה ימשוך מחדש את הכיתוב והתמונה מה-URL ויחליף את הפרומפט הנוכחי. הגרסה הישנה תישמר ב-לוגים. להמשיך?")) return;
    setErr(""); setStarting(true);
    try {
      const res = await learnFetch(`/api/v1/learn/sources/${sourceId}/regenerate`, {
        method: "POST",
        headers: adminHeaders(),
      });
      const j = await res.json();
      if (res.status === 401) {
        setErr("NEED_KEY");
        return;
      }
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setJobId(j.jobId);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setStarting(false);
    }
  }

  if (!hasUrl) {
    return (
      <span
        title="אין URL מקור — אי אפשר לשחזר"
        className="text-xs text-slate-600 bg-slate-900/40 border border-slate-800 px-3 py-1.5 rounded-lg cursor-not-allowed text-center"
      >
        🔁 צור פרומפט מחדש מהקישור
      </span>
    );
  }

  const pending = starting || !!jobId;

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        onClick={run}
        disabled={pending}
        className="text-xs bg-gradient-to-l from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded-lg disabled:opacity-50 text-center"
      >
        {pending ? "🔄 ממתין…" : "🔁 צור פרומפט מחדש מהקישור"}
      </button>
      {jobId && (
        <SyncProgress
          jobId={jobId}
          steps={["שומר גרסה קודמת", "מושך כיתוב + תמונה מהמקור", "Gemini בונה פרומפט חדש", "שומר ומחשב diff", "הושלם"]}
          onComplete={() => { setTimeout(() => window.location.reload(), 1200); }}
          onFailed={(e) => { setJobId(null); setErr(e); }}
        />
      )}
      {err === "NEED_KEY" ? (
        <span className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded px-2 py-1">
          ⚠ צריך admin key — <Link href="/admin" className="underline hover:text-amber-200">לחץ כאן להגדיר</Link>
        </span>
      ) : err ? (
        <span className="text-[11px] text-red-400">⚠ {err}</span>
      ) : null}
    </div>
  );
}
