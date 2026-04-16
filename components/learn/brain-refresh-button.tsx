"use client";
import { learnFetch } from "@/lib/learn/fetch";

import { useState } from "react";
import SyncProgress from "./sync-progress";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";

export default function BrainRefreshButton() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");

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
