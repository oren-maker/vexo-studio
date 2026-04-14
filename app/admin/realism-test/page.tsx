"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";

const DEFAULT_PROMPT = "A young woman with dark hair, wearing a navy blazer, standing in a busy newsroom looking concerned at her phone, soft afternoon light streaming through tall windows.";

export default function RealismTestPage() {
  const lang = useLang();
  const he = lang === "he";
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [imgBusy, setImgBusy] = useState(false);
  const [vidBusy, setVidBusy] = useState(false);
  const [imgRes, setImgRes] = useState<{ imageUrl: string; finalPromptSnippet: string; elapsedMs: number } | null>(null);
  const [vidRes, setVidRes] = useState<{ requestId: string; resultUrl: string; statusUrl: string; finalPromptSnippet: string; elapsedMs: number; model: string } | null>(null);
  const [vidUrl, setVidUrl] = useState<string | null>(null);
  const [videoModel, setVideoModel] = useState<"veo3-fast" | "veo3-pro" | "seedance" | "kling">("veo3-fast");
  const [duration, setDuration] = useState(5);

  async function runImage() {
    setImgBusy(true); setImgRes(null);
    try {
      setImgRes(await api(`/api/v1/admin/test-realism`, { method: "POST", body: { mode: "image", prompt } }));
    } catch (e) { alert((e as Error).message); }
    finally { setImgBusy(false); }
  }
  async function runVideo() {
    setVidBusy(true); setVidRes(null); setVidUrl(null);
    try {
      const r = await api<{ requestId: string; resultUrl: string; statusUrl: string; finalPromptSnippet: string; elapsedMs: number; model: string }>(`/api/v1/admin/test-realism`, {
        method: "POST",
        body: { mode: "video", prompt, videoModel, duration },
      });
      setVidRes(r);
      // Poll fal queue
      pollVideo(r.statusUrl, r.resultUrl);
    } catch (e) { alert((e as Error).message); setVidBusy(false); }
  }

  async function pollVideo(_statusUrl: string, resultUrl: string) {
    // fal status polling requires the auth Key header; cleaner to just wait + fetch result
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(resultUrl + "?fal_internal_test_passthrough=1");
        if (r.ok) {
          const data = await r.json();
          const url = data?.video?.url ?? data?.output?.video?.url ?? data?.url;
          if (url) { setVidUrl(url); clearInterval(id); setVidBusy(false); }
        }
      } catch { /* keep polling */ }
      if (attempts > 30) { clearInterval(id); setVidBusy(false); }
    }, 4000);
  }

  return (
    <div className="space-y-6">
      <Card title={he ? "🧪 בדיקת ריאליזם" : "🧪 Realism test"} subtitle={he ? "מייצר תמונה / וידאו עם פרומפט הריאליזם הקבוע ומציג את התוצאה לבדיקה" : "Generate a sample image / video with the always-on realism wrapper and inspect the result"}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">{he ? "פרומפט בסיס (מה שהמשתמש כותב)" : "Base prompt (what the user types)"}</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm" />
            <div className="text-[11px] text-text-muted mt-1">{he ? "המערכת תעטוף אותו אוטומטית ב-Photorealistic, hyper-realistic, cinematic shot + שורת טכניקה ותאורה." : "System auto-wraps with Photorealistic, hyper-realistic, cinematic shot + technical + lighting suffix."}</div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button disabled={imgBusy} onClick={runImage} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
              {imgBusy ? (he ? "מייצר תמונה…" : "Generating image…") : (he ? "🖼 ייצר תמונה (nano-banana · ~$0.039)" : "🖼 Generate image (nano-banana · ~$0.039)")}
            </button>
            <div className="flex items-center gap-2">
              <select value={videoModel} onChange={(e) => setVideoModel(e.target.value as never)} className="px-2 py-2 rounded-lg border border-bg-main text-sm">
                <option value="veo3-fast">VEO 3 Fast ($0.40/sec)</option>
                <option value="veo3-pro">VEO 3 Pro ($0.75/sec)</option>
                <option value="seedance">SeeDance 2 ($0.124/sec)</option>
                <option value="kling">Kling 2.1 ($0.056/sec)</option>
              </select>
              <input type="number" min={1} max={10} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-16 px-2 py-2 rounded-lg border border-bg-main text-sm" />
              <span className="text-xs text-text-muted">{he ? "שניות" : "sec"}</span>
              <button disabled={vidBusy} onClick={runVideo} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
                {vidBusy ? (he ? "מייצר וידאו…" : "Generating video…") : (he ? "🎬 ייצר וידאו" : "🎬 Generate video")}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {imgRes && (
        <Card title={he ? "תוצאת תמונה" : "Image result"} subtitle={`${imgRes.elapsedMs}ms`}>
          <img src={imgRes.imageUrl} className="w-full max-w-2xl rounded-lg" />
          <div className="text-[11px] text-text-muted mt-2 font-mono whitespace-pre-wrap break-words">{imgRes.finalPromptSnippet}</div>
        </Card>
      )}

      {vidRes && (
        <Card title={he ? "תוצאת וידאו" : "Video result"} subtitle={`${vidRes.model} · submitted in ${vidRes.elapsedMs}ms`}>
          {vidUrl ? (
            <video src={vidUrl} controls className="w-full max-w-2xl rounded-lg bg-black" />
          ) : (
            <div className="text-text-muted text-sm">{he ? "ממתין לתוצאה מ-fal (30-90 שניות)..." : "Waiting for fal result (30-90s)…"}</div>
          )}
          <div className="text-[11px] text-text-muted mt-2 font-mono whitespace-pre-wrap break-words">{vidRes.finalPromptSnippet}</div>
        </Card>
      )}
    </div>
  );
}
