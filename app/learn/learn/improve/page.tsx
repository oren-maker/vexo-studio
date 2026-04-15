"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { improveAction } from "./actions";

type Result = Awaited<ReturnType<typeof improveAction>>;

export default function ImprovePage() {
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<Extract<Result, { ok: true }> | null>(null);
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function run() {
    setErr(""); setResult(null); setCopied(false);
    startTransition(async () => {
      const r = await improveAction(draft);
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }

  async function copyImproved() {
    if (!result) return;
    await navigator.clipboard.writeText(result.improvedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold text-white">שפר את הפרומפט שלי</h1>
        <span className="text-[11px] bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded border border-cyan-500/30">
          ציון · נקודות חוזק וחולשה · הצעות שיפור · שכתוב
        </span>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        הדבק פרומפט קיים (טיוטה שלך או של VEXO). Gemini יקרא אותו, ישווה ל-{"{"}4{"}"} פרומפטי Seedance רלוונטיים, וייתן לך ציון + הצעות שיפור קונקרטיות + פרומפט משופר.
      </p>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 mb-5">
        <label className="block text-sm font-medium text-slate-300 mb-2">הפרומפט לבדיקה</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          placeholder="A woman walks down a street at night..."
          className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none font-mono"
          dir="ltr"
        />
        <button
          onClick={run}
          disabled={pending || draft.trim().length < 10}
          className="mt-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
        >
          {pending ? "מנתח..." : "🔍 נתח ושפר"}
        </button>
      </div>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm mb-5">
          ⚠ {err}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">ציון כולל</h2>
              <div className={`text-4xl font-black ${scoreColor(result.scores.overall)}`}>
                {result.scores.overall}<span className="text-lg text-slate-500">/10</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <ScoreBar label="מבנה" value={result.scores.structure} />
              <ScoreBar label="קולנועי" value={result.scores.cinematic} />
              <ScoreBar label="ספציפי" value={result.scores.specificity} />
              <ScoreBar label="חושי" value={result.scores.sensoryDetail} />
              <ScoreBar label="טכני" value={result.scores.technical} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.strengths.length > 0 && (
              <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider mb-3">✓ מה עובד</h3>
                <ul className="space-y-2 text-sm text-slate-200">
                  {result.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}
            {result.weaknesses.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-amber-300 uppercase tracking-wider mb-3">⚠ איפה חלש</h3>
                <ul className="space-y-2 text-sm text-slate-200">
                  {result.weaknesses.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}
          </div>

          {result.suggestions.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">💡 הצעות שיפור קונקרטיות</h3>
              <ul className="space-y-3">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-3 bg-slate-950/40 rounded-lg p-3">
                    <KindBadge kind={s.kind} />
                    <div className="flex-1">
                      <div className="text-sm text-slate-100 mb-1">{s.what}</div>
                      <div className="text-xs text-slate-400 italic">{s.why}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-gradient-to-br from-cyan-500/10 to-purple-500/5 border border-cyan-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">✨ הפרומפט המשופר</h3>
              <button
                onClick={copyImproved}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded"
              >
                {copied ? "✓ הועתק" : "📋 העתק"}
              </button>
            </div>
            <div className="bg-slate-950/60 rounded-lg p-4 text-sm text-slate-100 leading-relaxed whitespace-pre-wrap font-mono" dir="ltr">
              {result.improvedPrompt}
            </div>
            {result.diffSummary && (
              <p className="text-sm text-slate-300 mt-3 italic">📝 {result.diffSummary}</p>
            )}
          </div>

          {result.referencesUsed.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
              <div className="text-xs text-cyan-300 uppercase tracking-wider mb-2">📚 למידה על בסיס</div>
              <ul className="space-y-1 text-sm">
                {result.referencesUsed.map((r) => (
                  <li key={r.id}>
                    <Link href={`/learn/sources/${r.id}`} className="text-slate-400 hover:text-cyan-400 hover:underline">
                      · {r.title || "(ללא כותרת)"}
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

function scoreColor(v: number) {
  if (v >= 8) return "text-emerald-300";
  if (v >= 6) return "text-cyan-300";
  if (v >= 4) return "text-amber-300";
  return "text-red-300";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = (value / 10) * 100;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-xs text-slate-400">{label}</div>
        <div className={`text-sm font-bold ${scoreColor(value)}`}>{value}</div>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-l from-cyan-400 to-purple-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: "add" | "replace" | "remove" }) {
  const map = {
    add: { label: "הוסף", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    replace: { label: "החלף", cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
    remove: { label: "הסר", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
  };
  const s = map[kind];
  return <span className={`text-[10px] uppercase font-semibold px-2 py-1 rounded border h-fit ${s.cls}`}>{s.label}</span>;
}
