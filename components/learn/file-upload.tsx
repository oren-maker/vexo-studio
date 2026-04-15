"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FileUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !prompt) return;

    setBusy(true);
    setErr("");
    setProgress(0);

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/learn/upload",
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });

      const res = await fetch("/api/learn/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          title: file.name,
          prompt,
          sourceType: "upload",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "שגיאה ביצירת מקור");
      }
      const j = await res.json();
      router.push(`/learn/sources/${j.id}`);
    } catch (e: any) {
      setErr(e.message || "שגיאה");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">קובץ וידאו *</label>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white file:ml-3 file:bg-cyan-500 file:text-slate-950 file:border-0 file:px-3 file:py-1 file:rounded file:font-medium"
        />
        <div className="text-[11px] text-slate-500 mt-1">MP4, WebM, MOV · עד 500MB</div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">הפרומפט של המדריך *</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          rows={5}
          placeholder="A cinematic close-up shot of..."
          className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">{err}</div>}

      {busy && progress > 0 && progress < 100 && (
        <div>
          <div className="text-xs text-slate-400 mb-1">מעלה... {progress}%</div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-l from-cyan-400 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <button
        disabled={busy || !file || !prompt}
        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-6 py-2.5 rounded-lg text-sm disabled:opacity-50 w-fit"
      >
        {busy ? (progress === 100 ? "מפעיל Pipeline..." : "מעלה...") : "🚀 העלה והפעל ניתוח"}
      </button>
    </form>
  );
}
