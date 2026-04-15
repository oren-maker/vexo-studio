"use client";

import { useState, useTransition } from "react";
import { retryAnalysisAction } from "@/app/learn/sources/[id]/actions";

export default function RetryAnalysisButton({ sourceId }: { sourceId: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);

  function run() {
    setErr(""); setDone(null);
    startTransition(async () => {
      const r = await retryAnalysisAction(sourceId);
      if (!r.ok) setErr(r.error);
      else {
        setDone(r.engine);
        // Hard reload to pull fresh analysis
        setTimeout(() => window.location.reload(), 600);
      }
    });
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={pending}
        className="bg-gradient-to-l from-cyan-500 to-purple-500 hover:opacity-90 text-white font-bold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
      >
        {pending ? "🔄 מריץ ניתוח מחדש..." : "🔁 נסה שוב"}
      </button>
      {done && <div className="text-[11px] text-emerald-400 mt-1">✓ הושלם דרך {done}</div>}
      {err && <div className="text-[11px] text-red-400 mt-2 max-w-md">⚠ {err}</div>}
    </div>
  );
}
