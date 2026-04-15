"use client";

import { useState, useTransition } from "react";
import { generateMoreAction } from "@/app/learn/my-prompts/actions";

export default function GenerateButton() {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState("");
  const [done, setDone] = useState<number | null>(null);

  function onClick() {
    setErr(""); setDone(null);
    startTransition(async () => {
      const r = await generateMoreAction(20);
      if (!r.ok) setErr(r.error);
      else setDone(r.created);
    });
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={pending}
        className="bg-gradient-to-l from-cyan-500 to-purple-500 hover:opacity-90 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "מחולל..." : "✨ צור 20 פרומפטים מהמאגר"}
      </button>
      {done !== null && (
        <div className="text-[11px] text-emerald-400 mt-1 text-left">✓ נוצרו {done}</div>
      )}
      {err && (
        <div className="text-[11px] text-red-400 mt-1 text-left">⚠ {err}</div>
      )}
    </div>
  );
}
