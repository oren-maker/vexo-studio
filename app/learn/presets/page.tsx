"use client";
import { useState } from "react";
import Link from "next/link";
import { PROMPT_PRESETS, presetsByCategory } from "@/lib/learn/prompt-presets";

// Prompt preset gallery — visual grid of ready-made briefs Oren can
// copy or send straight to the brain's compose flow.

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  cinematic: { label: "קולנועי", icon: "🎬" },
  docu: { label: "תיעודי", icon: "📰" },
  character: { label: "דמות", icon: "🎭" },
  genre: { label: "ז'אנר", icon: "🎞" },
  commercial: { label: "מסחרי", icon: "📱" },
};

export default function PresetsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const grouped = presetsByCategory();

  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId((c) => c === id ? null : c), 1500); } catch {}
  }

  function openInChat(brief: string) {
    sessionStorage.setItem("vexo-command-palette-prefill", `תייצר פרומפט על: ${brief}`);
    window.location.href = "/learn/brain/chat";
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">📚 תבניות פרומפט</h1>
        <p className="text-sm text-slate-400 mt-1">{PROMPT_PRESETS.length} תבניות מוכנות. העתק או שלח ישירות לבמאי ליצירת compose_prompt.</p>
      </header>

      {Object.entries(grouped).map(([cat, items]) => {
        if (items.length === 0) return null;
        const meta = CATEGORY_LABELS[cat] ?? { label: cat, icon: "📌" };
        return (
          <section key={cat}>
            <h2 className="text-lg font-semibold text-slate-200 mb-3">{meta.icon} {meta.label}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {items.map((p) => (
                <div key={p.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-cyan-500/40 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{p.emoji}</span>
                    <h3 className="font-semibold text-slate-100 flex-1">{p.label}</h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3 line-clamp-4">{p.brief}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copy(p.id, p.brief)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      {copiedId === p.id ? "✓ הועתק" : "📋 העתק"}
                    </button>
                    <button
                      onClick={() => openInChat(p.brief)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
                    >
                      🧠 שלח לבמאי
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="text-center pt-6 text-xs text-slate-500">
        <Link href="/learn/brain/chat" className="text-cyan-400 hover:underline">חזור לצ'אט ←</Link>
      </div>
    </div>
  );
}
