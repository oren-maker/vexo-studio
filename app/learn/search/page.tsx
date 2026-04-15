"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Suggestion = {
  source: string;
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  downloadUrl: string;
  previewUrl: string;
  author: string;
};

export default function VideoSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function onSearch() {
    if (!q) return;
    setLoading(true);
    setErr("");
    const res = await fetch(`/api/learn/search/videos?q=${encodeURIComponent(q)}`);
    const j = await res.json();
    if (!res.ok) setErr(j.error || "שגיאה");
    else setResults(j.results || []);
    setLoading(false);
  }

  async function onAnalyze(s: Suggestion) {
    if (!prompt.trim()) {
      setErr("הזן פרומפט לפני ניתוח");
      return;
    }
    setAnalyzing(s.id);
    const res = await fetch("/api/learn/search/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        downloadUrl: s.downloadUrl,
        title: s.title,
        thumbnail: s.thumbnail,
        duration: s.duration,
        prompt,
      }),
    });
    const j = await res.json();
    setAnalyzing(null);
    if (!res.ok) {
      setErr(j.error || "שגיאה");
      return;
    }
    router.push(`/learn/sources/${j.id}`);
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">חיפוש וידאו</h1>
      <p className="text-sm text-slate-400 mb-6">חפש ב-Pexels, בחר סרטון רלוונטי, ושלח לניתוח Gemini.</p>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-5 flex flex-col gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="חיפוש: cinematic sunset, slow motion, drone footage..."
          className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="הפרומפט שלך לניתוח (יישלח ל-Gemini כקונטקסט)..."
          rows={3}
          className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
        />
        <button
          onClick={onSearch}
          disabled={loading || !q}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50 w-fit"
        >
          {loading ? "מחפש..." : "🔍 חפש 3 תוצאות"}
        </button>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm mb-4">{err}</div>}

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {results.map((s) => (
            <div key={s.id} className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="aspect-video bg-slate-800 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.thumbnail} alt={s.title} className="w-full h-full object-cover" />
                <span className="absolute bottom-2 right-2 text-[10px] bg-slate-950/80 text-white px-2 py-0.5 rounded">
                  {s.duration}s
                </span>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-400 mb-2">{s.author}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAnalyze(s)}
                    disabled={analyzing === s.id || !prompt}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-3 py-1.5 rounded text-xs disabled:opacity-50"
                  >
                    {analyzing === s.id ? "שולח..." : "🧠 נתח"}
                  </button>
                  <a
                    href={s.previewUrl}
                    target="_blank"
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded text-xs"
                  >
                    👁
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
