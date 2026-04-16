"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { generateImageAction } from "@/app/learn/sources/[id]/actions";

export default function GenerateImageButton({ sourceId }: { sourceId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking anywhere outside (including the video button)
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(engine: "nano-banana" | "imagen-4") {
    setOpen(false);
    if (!confirm(`יצירת תמונה ב-${engine} עולה כ-$0.04. להמשיך?`)) return;
    setErr(""); setUrl(null); setCost(null);
    startTransition(async () => {
      const r = await generateImageAction(sourceId, engine);
      if (!r.ok) setErr(r.error);
      else {
        setUrl(r.imageUrl);
        setCost(r.cost);
        setTimeout(() => window.location.reload(), 1200);
      }
    });
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        disabled={pending}
        className="bg-gradient-to-l from-amber-500 to-pink-500 hover:opacity-90 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {pending ? "🎨 יוצר תמונה..." : "🎨 צור תמונה ▾"}
      </button>
      {open && !pending && (
        <div className="absolute z-10 right-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={() => run("nano-banana")}
            className="block w-full text-right p-3 hover:bg-slate-800 border-b border-slate-800"
          >
            <div className="text-sm font-bold text-white">🍌 nano-banana</div>
            <div className="text-[10px] text-slate-400">Gemini 2.5 Flash Image · מהיר · $0.04</div>
          </button>
          <button
            onClick={() => run("imagen-4")}
            className="block w-full text-right p-3 hover:bg-slate-800"
          >
            <div className="text-sm font-bold text-white">🎨 Imagen 4</div>
            <div className="text-[10px] text-slate-400">Google Imagen · איכות גבוהה · $0.04</div>
          </button>
        </div>
      )}
      {url && cost !== null && (
        <div className="text-[11px] text-emerald-400 mt-2">✓ נוצר · עלות: ${cost.toFixed(4)}</div>
      )}
      {err && <div className="text-[11px] text-red-400 mt-2 max-w-md">⚠ {err}</div>}
    </div>
  );
}
