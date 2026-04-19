"use client";
import { useEffect, useState } from "react";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";

type Payload = {
  chatIdUsed: string | null;
  sampleMessage: string;
  ragHits: { id: string; title: string | null; score: number }[];
  promptLength: number;
  prompt: string;
};

// Brain prompt inspector — transparency window.
// Shows the EXACT system prompt the brain will see next turn, built from
// live data (DailyBrainCache, BrainReference, recent chats, RAG against a
// sample message, page context). Useful for debugging "why did the brain
// say X?" or auditing what's being sent to Gemini.

export default function LastPromptPage() {
  const [sample, setSample] = useState("מה הסטטוס של הסדרה?");
  const [chatId, setChatId] = useState<string>("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("vexo-brain-chatId");
    if (stored) setChatId(stored);
  }, []);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const url = `/api/v1/learn/brain/chat?sample=${encodeURIComponent(sample)}${chatId ? `&chatId=${encodeURIComponent(chatId)}` : ""}`;
      const r = await learnFetch(url, { headers: adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  async function copyPrompt() {
    if (!data?.prompt) return;
    try { await navigator.clipboard.writeText(data.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  useEffect(() => { load(); /* initial */ }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">🔎 System Prompt Inspector</h1>
        <p className="text-sm text-slate-400 mt-1">הפרומפט המלא שהבמאי יקבל בסיבוב הבא — נבנה מנתונים חיים (DailyBrainCache, BrainReference, 10 שיחות אחרונות, RAG על המסר לדוגמה, page context).</p>
      </header>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 grid md:grid-cols-3 gap-3">
        <label className="md:col-span-2">
          <div className="text-[10px] uppercase text-slate-400 mb-1">מסר לדוגמה (ל-RAG)</div>
          <input value={sample} onChange={(e) => setSample(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm" />
        </label>
        <label>
          <div className="text-[10px] uppercase text-slate-400 mb-1">chatId (אופציונלי)</div>
          <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="auto" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono" />
        </label>
        <button onClick={load} disabled={loading} className="md:col-span-3 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm disabled:opacity-50">
          {loading ? "בונה..." : "🔄 בנה מחדש"}
        </button>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">{err}</div>}

      {data && (
        <>
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex items-center gap-6 flex-wrap text-xs">
            <div><span className="text-slate-400">אורך:</span> <span className="font-bold num">{data.promptLength.toLocaleString()}</span> תווים</div>
            <div><span className="text-slate-400">~טוקנים:</span> <span className="font-bold num">{Math.round(data.promptLength / 4).toLocaleString()}</span></div>
            <div><span className="text-slate-400">RAG hits:</span> <span className="font-bold">{data.ragHits.length}</span></div>
            <button onClick={copyPrompt} className="ms-auto text-[11px] px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200">
              {copied ? "✓ הועתק" : "📋 העתק פרומפט"}
            </button>
          </div>

          {data.ragHits.length > 0 && (
            <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-200 mb-2">RAG שמוזרק עכשיו</h2>
              <ol className="text-xs space-y-1">
                {data.ragHits.map((h, i) => (
                  <li key={h.id} className="flex gap-2">
                    <span className="text-slate-500 num">#{i + 1}</span>
                    <span className="text-cyan-400 num">[{Math.round(h.score * 100)}%]</span>
                    <span className="text-slate-300 truncate">{h.title ?? h.id.slice(-8)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Full prompt</h2>
            <pre className="text-[11px] leading-snug text-slate-200 whitespace-pre-wrap font-mono max-h-[60vh] overflow-y-auto" dir="rtl">{data.prompt}</pre>
          </section>
        </>
      )}
    </div>
  );
}
