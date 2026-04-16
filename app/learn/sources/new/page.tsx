import { learnFetch } from "@/lib/learn/fetch";
"use client";

import { adminHeaders } from "@/lib/learn/admin-key";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import FileUpload from "@/components/learn/file-upload";
import { ingestSocialVideoAction } from "./actions";

type Mode = "instagram" | "upload" | "url";

export default function AddSource() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("instagram");

  // Direct URL mode
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlErr, setUrlErr] = useState("");

  // Instagram mode
  const [igUrl, setIgUrl] = useState("");
  const [igPending, startIgTransition] = useTransition();
  const [igErr, setIgErr] = useState("");
  const [igResult, setIgResult] = useState<any>(null);

  async function onUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUrlBusy(true); setUrlErr("");
    const res = await learnFetch("/api/v1/learn/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, prompt }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setUrlErr(j.error || "שגיאה");
      setUrlBusy(false);
      return;
    }
    const j = await res.json();
    router.push(`/learn/sources/${j.id}`);
  }

  function runInstagram() {
    setIgErr(""); setIgResult(null);
    startIgTransition(async () => {
      const r = await ingestSocialVideoAction(igUrl);
      if (!r.ok) setIgErr(r.error);
      else setIgResult(r);
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">הוספת מקור</h1>
      <p className="text-sm text-slate-400 mb-6">
        הזן קישור Instagram, העלה קובץ וידאו, או URL ישיר ל-MP4. המערכת תוריד, תתרגם, ותחלץ פרומפט בעזרת Gemini.
      </p>

      <div className="flex gap-1 mb-5 bg-slate-900/60 border border-slate-800 rounded-lg p-1 w-fit flex-wrap">
        <TabButton active={mode === "instagram"} onClick={() => setMode("instagram")} label="📸 Instagram" />
        <TabButton active={mode === "upload"} onClick={() => setMode("upload")} label="📤 העלאת קובץ" />
        <TabButton active={mode === "url"} onClick={() => setMode("url")} label="🔗 URL ישיר" />
      </div>

      {mode === "instagram" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">קישור ל-Reel / Post *</label>
            <input
              value={igUrl}
              onChange={(e) => setIgUrl(e.target.value)}
              type="url"
              dir="ltr"
              placeholder="https://www.instagram.com/reel/..."
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              רק פוסטים ציבוריים · המערכת תוריד את הוידאו ל-Vercel Blob (שורד גם אחרי שה-CDN של Instagram יפוג), תשלח ל-Gemini, תתרגם את הכיתוב לאנגלית ותחלץ פרומפט מוכן לשימוש.
            </div>
          </div>

          {igErr && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">⚠ {igErr}</div>}

          <button
            onClick={runInstagram}
            disabled={igPending || !igUrl}
            className="bg-gradient-to-l from-pink-500 to-purple-500 hover:opacity-90 text-white font-bold px-6 py-2.5 rounded-lg text-sm disabled:opacity-50 w-fit"
          >
            {igPending ? "מוריד, מתרגם, מנתח..." : "🚀 הפעל פייפליין מלא"}
          </button>

          {igPending && (
            <div className="text-xs text-slate-400 space-y-1 mt-2">
              <div>⏳ שלב 1: חילוץ קישור ישיר מ-Instagram…</div>
              <div>⏳ שלב 2: הורדה ל-Vercel Blob…</div>
              <div>⏳ שלב 3: Gemini צופה בוידאו, מתרגם ומחלץ פרומפט…</div>
              <div className="text-[11px] text-slate-500">~30-90 שניות בדרך כלל</div>
            </div>
          )}

          {igResult && <IgResultPanel result={igResult} onOpen={() => router.push(`/learn/sources/${igResult.id}`)} />}
        </div>
      )}

      {mode === "upload" && <FileUpload />}

      {mode === "url" && (
        <form onSubmit={onUrlSubmit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">URL ישיר למקור וידאו *</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              type="url"
              dir="ltr"
              placeholder="https://videos.pexels.com/.../video.mp4"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Pexels, Pixabay, Vercel Blob, או MP4/webm ישיר. YouTube/Vimeo לא נתמכים כ-URL — השתמש בטאב Instagram או העלאה ידנית.
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">הפרומפט של המדריך *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={5}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {urlErr && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{urlErr}</div>}

          <div className="flex gap-2">
            <button
              disabled={urlBusy || !url || !prompt}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-6 py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {urlBusy ? "שולח..." : "🚀 הפעל pipeline"}
            </button>
            <button type="button" onClick={() => router.back()} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 py-2.5 rounded-lg text-sm">
              ביטול
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded text-sm font-medium transition whitespace-nowrap ${
        active ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function IgResultPanel({ result, onOpen }: { result: any; onOpen: () => void }) {
  return (
    <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 border border-emerald-500/30 rounded-xl p-5 mt-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-white">✓ נוצר בהצלחה</h3>
        <button onClick={onOpen} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-4 py-1.5 rounded text-xs">
          פתח ←
        </button>
      </div>
      <div className="text-sm text-slate-200 mb-2"><b>כותרת:</b> {result.title}</div>
      {result.style && <div className="text-xs text-slate-400 mb-1">סגנון: <span className="text-cyan-300">{result.style}</span> · mood: <span className="text-purple-300">{result.mood || "-"}</span></div>}
      {result.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.thumbnail} alt="" className="w-full max-h-64 object-cover rounded-lg my-3" />
      )}
      {result.originalCaption && (
        <details className="mt-3">
          <summary className="text-xs text-slate-400 cursor-pointer">כיתוב מקורי + תרגום</summary>
          <div className="mt-2 bg-slate-950/60 rounded p-3 text-xs text-slate-300 space-y-2" dir="auto">
            <div><b className="text-slate-400">מקורי:</b> {result.originalCaption}</div>
            {result.captionEnglish && <div><b className="text-slate-400">EN:</b> {result.captionEnglish}</div>}
          </div>
        </details>
      )}
      <div className="mt-3">
        <div className="text-[10px] uppercase text-emerald-400 font-semibold mb-2">Generated prompt</div>
        <pre className="bg-slate-950/60 rounded p-3 text-xs text-slate-100 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed" dir="ltr">{result.generatedPrompt}</pre>
      </div>
      {result.techniques?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {result.techniques.slice(0, 8).map((t: string) => (
            <span key={t} className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
