"use client";

import { useState } from "react";

const SECTIONS = [
  { key: "VISUAL STYLE", label: "Visual Style", color: "cyan" },
  { key: "FILM STOCK", label: "Film Stock & Lens", color: "purple" },
  { key: "COLOR", label: "Color & Grade", color: "amber" },
  { key: "LIGHTING", label: "Lighting", color: "yellow" },
  { key: "CHARACTER", label: "Character / Subject", color: "emerald" },
  { key: "AUDIO", label: "Audio / Sound", color: "blue" },
  { key: "TIMELINE", label: "Timeline / Beats", color: "pink" },
  { key: "QUALITY", label: "Quality Boosters", color: "slate" },
] as const;

const HEADERS_RE = SECTIONS.map((s) => s.key.replace(/ /g, "\\s*")).join("|");

function extractSection(prompt: string, name: string): string {
  const escaped = name.replace(/ /g, "\\s*");
  const re = new RegExp(
    `(?:^|\\n)\\*{0,2}\\s*\\[?\\s*${escaped}[^\\n\\]:—-]*\\]?\\*{0,2}\\s*[:\\-—]?\\s*([\\s\\S]*?)(?=\\n\\s*\\*{0,2}\\s*\\[?\\s*(?:${HEADERS_RE})|$)`,
    "i",
  );
  return prompt.match(re)?.[1]?.trim().slice(0, 2000) || "";
}

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export default function PromptDiffViewer({
  oldPrompt,
  newPrompt,
  oldLabel,
  newLabel,
}: {
  oldPrompt: string;
  newPrompt: string;
  oldLabel: string;
  newLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const oldWords = wordCount(oldPrompt);
  const newWords = wordCount(newPrompt);
  const wordDelta = newWords - oldWords;
  const wordPct = oldWords > 0 ? Math.round((wordDelta / oldWords) * 100) : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-medium"
      >
        🆚 השווה לנוכחי
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-slate-950 border border-slate-700 rounded-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">השוואת פרומפטים</h2>
                <div className="text-xs text-slate-400 mt-1">
                  {oldLabel} → {newLabel}
                  <span className="mx-3">·</span>
                  <span className="text-slate-300">
                    {oldWords} → {newWords} מילים{" "}
                    <span className={wordDelta > 0 ? "text-emerald-400" : wordDelta < 0 ? "text-red-400" : "text-slate-500"}>
                      ({wordDelta > 0 ? "+" : ""}
                      {wordDelta} / {wordPct > 0 ? "+" : ""}
                      {wordPct}%)
                    </span>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white text-xl px-2"
              >
                ✕
              </button>
            </div>

            {/* Section-by-section comparison */}
            <div className="space-y-3 mb-6">
              {SECTIONS.map((s) => {
                const oldVal = extractSection(oldPrompt, s.key);
                const newVal = extractSection(newPrompt, s.key);
                if (!oldVal && !newVal) return null;
                const changed = oldVal !== newVal;
                return (
                  <div
                    key={s.key}
                    className={`border rounded-lg p-3 ${
                      changed ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800 bg-slate-900/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-cyan-300 uppercase">{s.label}</span>
                      <span className="text-[10px] text-slate-500">
                        {wordCount(oldVal)} → {wordCount(newVal)} מילים
                        {changed && <span className="text-amber-400 mr-2">⚠ השתנה</span>}
                        {!changed && oldVal && <span className="text-emerald-400 mr-2">✓ זהה</span>}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-[9px] uppercase text-red-400 mb-1">לפני ({oldLabel})</div>
                        <div className="bg-slate-950/60 border border-red-500/20 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-slate-300" dir="ltr">
                          {oldVal || <span className="text-slate-600 italic">— ריק —</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-emerald-400 mb-1">אחרי ({newLabel})</div>
                        <div className="bg-slate-950/60 border border-emerald-500/20 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-emerald-50" dir="ltr">
                          {newVal || <span className="text-slate-600 italic">— ריק —</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full text fallback */}
            <details className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-cyan-300">
                📄 הצג את הפרומפט המלא של שתי הגרסאות
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="text-[10px] uppercase text-red-400 mb-1">לפני</div>
                  <pre className="bg-slate-950/70 rounded p-3 text-[11px] text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto" dir="ltr">
                    {oldPrompt}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-emerald-400 mb-1">אחרי</div>
                  <pre className="bg-slate-950/70 rounded p-3 text-[11px] text-emerald-50 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto" dir="ltr">
                    {newPrompt}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
    </>
  );
}
