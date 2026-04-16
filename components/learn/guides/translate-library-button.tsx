import { learnFetch } from "@/lib/learn/fetch";
"use client";

import { useState } from "react";
import SyncProgress from "@/components/learn/sync-progress";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";

export default function TranslateLibraryButton() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<number | null>(null);

  async function run() {
    if (!getAdminKey()) { setErr("הגדר admin key ב-/admin"); return; }
    if (!confirm("Gemini יתרגם לעברית את כל המדריכים שעוד לא תורגמו. להמשיך?")) return;
    setErr(""); setStarting(true);
    try {
      const res = await learnFetch("/api/v1/learn/guides/translate-library-to-hebrew", {
        method: "POST",
        headers: adminHeaders(),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      if (j.total === 0) {
        setDone(0);
        return;
      }
      setJobId(j.jobId);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setStarting(false);
    }
  }

  const pending = starting || !!jobId;

  return (
    <div className="inline-flex flex-col items-stretch gap-2 min-w-[200px]">
      <button
        onClick={run}
        disabled={pending}
        className="text-xs bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 px-3 py-1.5 rounded disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "🔄 מתרגם…" : "🌐 תרגם הכל לעברית"}
      </button>
      {jobId && (
        <SyncProgress
          jobId={jobId}
          steps={["Gemini מתרגם לעברית", "הושלם"]}
          onComplete={() => { setTimeout(() => window.location.reload(), 1000); }}
          onFailed={(e) => { setJobId(null); setErr(e); }}
        />
      )}
      {done === 0 && <span className="text-[11px] text-emerald-300">✓ כל המדריכים כבר בעברית</span>}
      {err && <span className="text-[11px] text-red-400">⚠ {err}</span>}
    </div>
  );
}
