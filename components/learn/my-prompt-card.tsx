"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteMyPromptAction } from "@/app/learn/my-prompts/actions";

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  "corpus-generator": { label: "✨ מהמאגר", cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  "gemini-compose": { label: "🧠 Gemini", cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  "manual": { label: "✍️ ידני", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  "json-import": { label: "📥 JSON", cls: "bg-slate-700 text-slate-300 border-slate-600" },
  "csv-import": { label: "📊 CSV", cls: "bg-slate-700 text-slate-300 border-slate-600" },
  "bulk-import": { label: "📥 bulk", cls: "bg-slate-700 text-slate-300 border-slate-600" },
};

export default function MyPromptCard({ source }: {
  source: {
    id: string;
    title: string | null;
    prompt: string;
    addedBy: string | null;
    createdAt: string;
    blobUrl: string | null;
    thumbnail: string | null;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [removed, setRemoved] = useState(false);

  const badge = SOURCE_BADGE[source.addedBy || ""] || { label: source.addedBy || "?", cls: "bg-slate-700 text-slate-300 border-slate-600" };

  async function copy() {
    await navigator.clipboard.writeText(source.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onDelete() {
    if (!confirm("למחוק?")) return;
    startTransition(async () => {
      const r = await deleteMyPromptAction(source.id);
      if (r.ok) setRemoved(true);
    });
  }

  if (removed) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-[10px] text-slate-500">
          {new Date(source.createdAt).toLocaleDateString("he-IL")}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-white mb-2 line-clamp-1">{source.title || "(ללא כותרת)"}</h3>
      <div
        className={`text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed ${
          expanded ? "" : "line-clamp-6"
        }`}
        dir="ltr"
      >
        {source.prompt}
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800 text-xs">
        <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-200">
          {expanded ? "הצג פחות" : "הצג הכל"}
        </button>
        <button onClick={copy} className="text-cyan-400 hover:underline">
          {copied ? "✓ הועתק" : "📋 העתק"}
        </button>
        <Link href={`/learn/sources/${source.id}`} className="text-cyan-400 hover:underline">
          פתח
        </Link>
        <div className="flex-1" />
        <button onClick={onDelete} disabled={pending} className="text-red-400 hover:underline disabled:opacity-50">
          {pending ? "מוחק..." : "מחק"}
        </button>
      </div>
    </div>
  );
}
