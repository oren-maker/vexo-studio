"use client";
import { learnFetch } from "@/lib/learn/fetch";

import { adminHeaders } from "@/lib/learn/admin-key";
import { useEffect, useState } from "react";

type JobStatus = {
  id: string;
  operation: string;
  status: "running" | "complete" | "failed";
  totalItems: number;
  completedItems: number;
  currentStep: string | null;
  currentMessage: string | null;
  progressPct: number;
  result: any;
  error: string | null;
  elapsedSec: number;
};

export default function SyncProgress({
  jobId,
  steps,
  onComplete,
  onFailed,
}: {
  jobId: string;
  steps: string[];
  onComplete: (result: any) => void;
  onFailed: (error: string) => void;
}) {
  const [status, setStatus] = useState<JobStatus | null>(null);

  useEffect(() => {
    let done = false;
    async function poll() {
      try {
        const res = await learnFetch(`/api/v1/learn/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) return;
        const s = (await res.json()) as JobStatus;
        setStatus(s);
        if (s.status === "complete") {
          done = true;
          onComplete(s.result);
        } else if (s.status === "failed") {
          done = true;
          onFailed(s.error || "שגיאה לא ידועה");
        }
      } catch {}
    }
    poll();
    const iv = setInterval(() => {
      if (!done) poll();
    }, 2000);
    return () => clearInterval(iv);
  }, [jobId, onComplete, onFailed]);

  if (!status) {
    return (
      <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-5 mt-4">
        <div className="text-sm text-slate-300 animate-pulse">🔄 מאתחל…</div>
      </div>
    );
  }

  const currentStepIndex = (() => {
    if (!status.currentStep) return 0;
    const i = steps.findIndex((s) => status.currentStep?.includes(s.replace(/\s+$/, "")));
    return i >= 0 ? i : 0;
  })();

  return (
    <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">⚙️ עיבוד רץ…</h3>
        <span className="text-[10px] font-mono text-slate-500">{status.elapsedSec}s</span>
      </div>

      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-l from-cyan-500 to-purple-500 transition-all duration-500"
          style={{ width: `${Math.max(3, status.progressPct)}%` }}
        />
      </div>
      <div className="text-xs text-slate-400 mb-4 text-center">
        {status.progressPct}% · {status.currentStep || "…"}
        {status.currentMessage && <span className="text-slate-500"> · {status.currentMessage}</span>}
      </div>

      {steps.length > 0 && (
        <ol className="space-y-2">
          {steps.map((s, i) => {
            const done = i < currentStepIndex;
            const active = i === currentStepIndex;
            return (
              <li key={i} className="flex items-center gap-3 text-xs">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                    done
                      ? "bg-emerald-500 text-slate-950"
                      : active
                      ? "bg-cyan-500 text-white animate-pulse"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {done ? "✓" : active ? "●" : i + 1}
                </div>
                <span className={done ? "text-emerald-300" : active ? "text-white font-medium" : "text-slate-500"}>
                  {s}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
