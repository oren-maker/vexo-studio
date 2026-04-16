import { learnFetch } from "@/lib/learn/fetch";
"use client";

import { adminHeaders } from "@/lib/learn/admin-key";
import { useState } from "react";
import SyncProgress from "@/components/learn/sync-progress";

export default function TriggerImprovementButton({ snapshotId }: { snapshotId: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<any>(null);
  const [starting, setStarting] = useState(false);

  async function run() {
    if (!confirm("להפעיל auto-improvement? זה יקרא ל-Gemini על עד 5 פרומפטים (~$0.005) ויעדכן אותם עם שמירת גרסה קודמת.")) return;
    setErr(""); setDone(null); setStarting(true);
    try {
      const res = await learnFetch("/api/v1/learn/auto-improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, max: 5 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); setStarting(false); return; }
      setJobId(j.jobId);
    } catch (e: any) {
      setErr(e.message || "שגיאה");
    } finally {
      setStarting(false);
    }
  }

  const pending = starting || !!jobId;

  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/5 border border-purple-500/30 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-white mb-1">🔄 הפעל Auto-Improvement</h3>
          <p className="text-xs text-slate-400 max-w-lg">
            המערכת תבחר פרומפטים עם ניתוח רזה ותשדרג אותם לפי התובנות העדכניות. כל שדרוג שומר את הגרסה הקודמת.
          </p>
        </div>
        <button
          onClick={run}
          disabled={pending}
          className="bg-gradient-to-l from-purple-500 to-cyan-500 hover:opacity-90 text-white font-bold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "🔄 מריץ…" : "🚀 הרץ עכשיו"}
        </button>
      </div>

      {jobId && (
        <SyncProgress
          jobId={jobId}
          steps={[
            "טוען תובנות",
            "בוחר פרומפטים רזים",
            "Gemini בודק ומשפר",
            "שומר גרסה קודמת",
            "מחיל שדרוג",
          ]}
          onComplete={(r) => {
            setJobId(null);
            setDone(r);
            if (r?.runId) {
              setTimeout(() => {
                window.location.href = `/learn/logs/improvement/${r.runId}`;
              }, 1500);
            }
          }}
          onFailed={(e) => { setJobId(null); setErr(e); }}
        />
      )}

      {done && (
        <div className="mt-3 text-xs text-emerald-300">
          ✓ הושלם · נבדקו {done.examined} · שודרגו {done.improved} · עלות ${done.totalCostUsd?.toFixed(4) || "0"} · מעביר לדף התוצאות…
        </div>
      )}
      {err && <div className="mt-3 text-xs text-red-400">⚠ {err}</div>}
    </div>
  );
}
