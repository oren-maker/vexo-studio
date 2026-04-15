"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { composeAction, saveComposedAction } from "./actions";

type Result = { prompt: string; rationale: string; similar: Array<{ id: string; title: string | null; externalId: string | null }> };

export default function ComposePage() {
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function generate() {
    setErr(""); setResult(null); setSaved(null); setCopied(false);
    startTransition(async () => {
      const r = await composeAction(brief);
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    const r = await saveComposedAction({ prompt: result.prompt, brief });
    setSaving(false);
    if (r.ok) setSaved(r.id); else setErr(r.error);
  }

  async function copyPrompt() {
    if (!result) return;
    await navigator.clipboard.writeText(result.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const examples = [
    "סרטון תדמית לחברת נדל״ן יוקרתי בתל אביב, נראות קולנועית",
    "Mira wakes up disoriented in a foggy room, slow push-in",
    "Short comedic sketch of a cat stealing food from a kitchen counter, UGC style",
    "15-second cinematic Wuxia duel in a bamboo forest",
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold text-white">מחולל פרומפטים</h1>
        <span className="text-[11px] bg-purple-500/20 text-purple-300 px-2 py-1 rounded border border-purple-500/30">
          Gemini 1.5 Flash · חינמי
        </span>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        תאר בקצרה מה אתה רוצה ליצור. Gemini ילמד מ-106 פרומפטי Seedance 2.0 שבמערכת ויכתוב עבורך פרומפט מקצועי באותו סגנון.
      </p>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 mb-5">
        <label className="block text-sm font-medium text-slate-300 mb-2">הבריף שלך</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          placeholder="לדוגמה: סרטון קולנועי של מאבק סמוראים ביער במבוק תחת גשם..."
          className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((ex, i) => (
            <button
              key={i}
              onClick={() => setBrief(ex)}
              className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded"
            >
              💡 {ex.slice(0, 40)}{ex.length > 40 ? "..." : ""}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={generate}
            disabled={pending || brief.trim().length < 5}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
          >
            {pending ? "מחולל..." : "✨ חולל פרומפט"}
          </button>
        </div>
      </div>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm mb-5">
          ⚠ {err}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/5 border border-purple-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">הפרומפט שנוצר</h2>
              <div className="flex gap-2">
                <button
                  onClick={copyPrompt}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded"
                >
                  {copied ? "✓ הועתק" : "📋 העתק"}
                </button>
                <button
                  onClick={save}
                  disabled={saving || !!saved}
                  className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium px-3 py-1.5 rounded disabled:opacity-50"
                >
                  {saved ? "✓ נשמר" : saving ? "שומר..." : "💾 שמור ל-DB"}
                </button>
              </div>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-4 text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-mono" dir="ltr">
              {result.prompt}
            </div>
            {saved && (
              <Link href={`/learn/sources/${saved}`} className="inline-block mt-3 text-xs text-cyan-400 hover:underline">
                פתח את המקור ←
              </Link>
            )}
          </div>

          {result.rationale && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="text-xs text-cyan-300 uppercase tracking-wider mb-2">💡 למה הפרומפט נראה ככה</div>
              <p className="text-sm text-slate-300 leading-relaxed">{result.rationale}</p>
            </div>
          )}

          {result.similar.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="text-xs text-cyan-300 uppercase tracking-wider mb-3">📚 למידה מ-{result.similar.length} פרומפטים דומים</div>
              <ul className="space-y-1.5 text-sm">
                {result.similar.map((s) => (
                  <li key={s.id}>
                    <Link href={`/learn/sources/${s.id}`} className="text-slate-300 hover:text-cyan-400 hover:underline">
                      · {s.title || "(ללא כותרת)"} <span className="text-slate-500 text-xs">{s.externalId}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
