"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";
import EditTimeline from "@/components/learn/video/edit-timeline";

type LocalClip = {
  tempId: string;
  blobUrl: string;
  filename: string;
  durationSec?: number;
  sizeBytes: number;
  trimStart: number | null;
  trimEnd: number | null;
  transition: "cut" | "fade" | "dissolve" | "ai-luma";
  transitionDur: number;
};

type AudioMode = "keep" | "mute" | "track" | "narration";

export default function MergeWorkflow() {
  const router = useRouter();
  const [clips, setClips] = useState<LocalClip[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);
  const [audioMode, setAudioMode] = useState<AudioMode>("keep");
  const [audioTrackUrl, setAudioTrackUrl] = useState<string | null>(null);
  const [narrationText, setNarrationText] = useState("");
  const [narrationVoice, setNarrationVoice] = useState<"Aoede" | "Charon" | "Fenrir" | "Kore" | "Puck">("Aoede");
  const [narrationGenerating, setNarrationGenerating] = useState(false);
  const [engine, setEngine] = useState<"wasm" | "shotstack">("wasm");
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [err, setErr] = useState("");

  const totalSize = clips.reduce((s, c) => s + c.sizeBytes, 0);
  const totalDur = clips.reduce((s, c) => s + (c.durationSec || 0), 0);
  const recommendShotstack = totalSize > 400 * 1024 * 1024 || totalDur > 600;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!getAdminKey()) {
      setErr("הגדר admin key ב-/admin לפני העלאה");
      return;
    }
    setUploading(true); setErr("");
    try {
      for (const file of Array.from(files)) {
        setUploadProgress({ name: file.name, pct: 0 });
        const blob = await upload(`video-merge/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/v1/learn/video/upload",
          clientPayload: JSON.stringify({ name: file.name }),
          onUploadProgress: (p) => setUploadProgress({ name: file.name, pct: Math.round(p.percentage) }),
          headers: adminHeaders() as any,
        });
        const dur = await probeVideoDuration(file).catch(() => undefined);
        setClips((prev) => [
          ...prev,
          {
            tempId: crypto.randomUUID(),
            blobUrl: blob.url,
            filename: file.name,
            durationSec: dur,
            sizeBytes: file.size,
            trimStart: null,
            trimEnd: null,
            transition: "cut",
            transitionDur: 0,
          },
        ]);
      }
    } catch (e: any) {
      setErr(e?.message || "שגיאה בהעלאה");
    } finally {
      setUploading(false); setUploadProgress(null);
    }
  }

  async function handleAudioFile(file: File) {
    setUploading(true); setErr("");
    try {
      const blob = await upload(`video-merge/audio-${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/v1/learn/video/upload",
        headers: adminHeaders() as any,
      });
      setAudioTrackUrl(blob.url);
    } catch (e: any) {
      setErr(e?.message || "שגיאה בהעלאת אודיו");
    } finally {
      setUploading(false);
    }
  }

  function moveClip(idx: number, dir: -1 | 1) {
    const next = [...clips];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setClips(next);
  }

  function removeClip(idx: number) {
    setClips(clips.filter((_, i) => i !== idx));
  }

  function updateClip(idx: number, patch: Partial<LocalClip>) {
    setClips(clips.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function startMerge() {
    if (clips.length < 2) { setErr("צריך לפחות 2 קליפים"); return; }
    setErr(""); setRunning(true); setProgressPct(0); setProgressMsg("יוצר פרויקט…");
    try {
      // 1. Create the job
      const createRes = await fetch("/api/v1/learn/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          engine,
          audioMode,
          audioTrackUrl,
          clips: clips.map((c) => ({
            blobUrl: c.blobUrl,
            filename: c.filename,
            durationSec: c.durationSec,
            sizeBytes: c.sizeBytes,
          })),
        }),
      });
      const j = await createRes.json();
      if (!createRes.ok || !j.ok) throw new Error(j.error || "create job failed");
      const jobId: string = j.job.id;

      // 2. Apply per-clip trim/transition settings via PATCH
      await fetch(`/api/v1/learn/video/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          clips: j.job.clips.map((dbClip: any, i: number) => ({
            id: dbClip.id,
            trimStart: clips[i].trimStart,
            trimEnd: clips[i].trimEnd,
            transition: i < clips.length - 1 ? clips[i].transition : null,
            transitionDur: i < clips.length - 1 ? clips[i].transitionDur : null,
          })),
        }),
      });

      // 3. Trigger run
      const runRes = await fetch(`/api/v1/learn/video/jobs/${jobId}/run`, {
        method: "POST",
        headers: adminHeaders(),
      });
      const runJson = await runRes.json();
      if (!runRes.ok || !runJson.ok) throw new Error(runJson.error || "run failed");

      if (engine === "shotstack") {
        // Server is rendering — redirect to the job page where polling will show progress
        router.push(`/video/jobs/${jobId}`);
        return;
      }

      // 4a. WASM path: extract frames + (optionally) generate AI transitions first
      setProgressPct(5); setProgressMsg("טוען FFmpeg.wasm…");
      const ffmpegMod = await import("@/lib/learn/ffmpeg-wasm");
      const { mergeClipsInBrowser, extractFirstFrame, extractLastFrame } = ffmpegMod;

      // For each AI transition, extract last frame of clip[i] + first frame of clip[i+1], upload, generate
      const aiOutputUrls: Record<number, string> = {}; // index → MP4 url of the AI transition between clips[i] and clips[i+1]
      const aiIndices = clips.map((c, i) => (i < clips.length - 1 && c.transition === "ai-luma" ? i : -1)).filter((i) => i >= 0);
      for (let k = 0; k < aiIndices.length; k++) {
        const i = aiIndices[k];
        setProgressPct(5 + (k / Math.max(1, aiIndices.length)) * 30);
        setProgressMsg(`🤖 AI transition ${k + 1}/${aiIndices.length} — מחלץ frames`);
        const [lastBlob, firstBlob] = await Promise.all([
          extractLastFrame(clips[i].blobUrl, clips[i].durationSec || 5, `c${i}-last`),
          extractFirstFrame(clips[i + 1].blobUrl, `c${i + 1}-first`),
        ]);
        // Upload both frames to Blob
        const [startUp, endUp] = await Promise.all([
          upload(`video-merge/frames/${jobId}-${i}-last.jpg`, new File([lastBlob], "last.jpg", { type: "image/jpeg" }), {
            access: "public",
            handleUploadUrl: "/api/v1/learn/video/upload",
            headers: adminHeaders() as any,
          }),
          upload(`video-merge/frames/${jobId}-${i + 1}-first.jpg`, new File([firstBlob], "first.jpg", { type: "image/jpeg" }), {
            access: "public",
            handleUploadUrl: "/api/v1/learn/video/upload",
            headers: adminHeaders() as any,
          }),
        ]);
        setProgressMsg(`🤖 AI transition ${k + 1}/${aiIndices.length} — Luma מרנדר (~30s)`);
        const genRes = await fetch("/api/v1/learn/video/transitions/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify({
            jobId,
            beforeClipId: j.job.clips[i].id,
            afterClipId: j.job.clips[i + 1].id,
            startFrameUrl: startUp.url,
            endFrameUrl: endUp.url,
            type: "luma-ray2",
            durationSec: 5,
          }),
        });
        const genJson = await genRes.json();
        if (!genRes.ok || !genJson.ok) throw new Error(`AI transition ${i}→${i + 1}: ${genJson.error || "failed"}`);
        // Poll the transition until done
        const transitionId = genJson.transitionId;
        const deadline = Date.now() + 5 * 60 * 1000;
        let lumaUrl: string | null = null;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 4000));
          const sRes = await fetch(`/api/v1/learn/video/transitions/${transitionId}`);
          if (!sRes.ok) continue;
          const sJson = await sRes.json();
          if (sJson.status === "complete" && sJson.outputUrl) { lumaUrl = sJson.outputUrl; break; }
          if (sJson.status === "failed") throw new Error(`AI transition failed: ${sJson.errorMsg || "unknown"}`);
        }
        if (!lumaUrl) throw new Error(`AI transition timeout`);
        aiOutputUrls[i] = lumaUrl;
      }

      // 4b. Build the actual concat list — interleave AI transition clips between user clips
      setProgressPct(40); setProgressMsg("מאחד את הקליפים והמעברים…");
      const mergeClipList: any[] = [];
      for (let i = 0; i < clips.length; i++) {
        mergeClipList.push({
          blobUrl: clips[i].blobUrl,
          filename: clips[i].filename,
          trimStart: clips[i].trimStart,
          trimEnd: clips[i].trimEnd,
          transition: aiOutputUrls[i] != null ? "cut" : clips[i].transition, // AI handled, force cut so wasm doesn't re-fade
          transitionDur: 0,
        });
        if (aiOutputUrls[i]) {
          mergeClipList.push({
            blobUrl: aiOutputUrls[i],
            filename: `ai-transition-${i}.mp4`,
            trimStart: null,
            trimEnd: null,
            transition: "cut",
            transitionDur: 0,
          });
        }
      }

      // Narration mode reuses the "track" path (TTS audio URL replaces the original)
      const effectiveAudioMode: "keep" | "mute" | "track" = audioMode === "narration" ? "track" : (audioMode as any);
      const blob = await mergeClipsInBrowser(mergeClipList, {
        audioMode: effectiveAudioMode,
        audioTrackUrl,
        onProgress: (pct, msg) => { setProgressPct(40 + pct * 0.55); setProgressMsg(msg); },
      });

      // 5. Upload merged result back to Blob
      setProgressPct(98); setProgressMsg("מעלה תוצאה ל-Blob…");
      const file = new File([blob], `merged-${jobId}.mp4`, { type: "video/mp4" });
      const outBlob = await upload(`video-merge/output-${jobId}.mp4`, file, {
        access: "public",
        handleUploadUrl: "/api/v1/learn/video/upload",
        headers: adminHeaders() as any,
      });

      // 6. Tell the server we're done
      await fetch(`/api/v1/learn/video/jobs/${jobId}/wasm-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ outputUrl: outBlob.url, outputDuration: totalDur }),
      });

      router.push(`/video/jobs/${jobId}`);
    } catch (e: any) {
      setErr(e?.message || "שגיאה לא ידועה");
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      <Section step={1} title="העלאת קליפים">
        <label className="block">
          <input
            type="file"
            multiple
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading || running}
            className="block w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-500 file:text-slate-950 hover:file:bg-cyan-400 file:cursor-pointer disabled:opacity-50"
          />
        </label>
        {uploadProgress && (
          <div className="mt-3 text-xs text-cyan-300">
            ⬆ {uploadProgress.name} · {uploadProgress.pct}%
          </div>
        )}
      </Section>

      {/* Step 2: Clip list */}
      {clips.length > 0 && (
        <Section step={2} title={`סידור ועריכה (${clips.length} clips · ${totalDur ? totalDur.toFixed(1) + "s" : "—"} · ${(totalSize / 1024 / 1024).toFixed(1)} MB)`}>
          <ul className="space-y-2">
            {clips.map((c, i) => (
              <li key={c.tempId} className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-cyan-300 font-mono w-6 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate text-sm">{c.filename}</div>
                    <div className="text-[11px] text-slate-500">
                      {c.durationSec ? `${c.durationSec.toFixed(1)}s` : ""} · {(c.sizeBytes / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => moveClip(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-cyan-300 disabled:opacity-30 px-2">↑</button>
                    <button onClick={() => moveClip(i, 1)} disabled={i === clips.length - 1} className="text-slate-400 hover:text-cyan-300 disabled:opacity-30 px-2">↓</button>
                    <button onClick={() => removeClip(i)} className="text-red-400 hover:text-red-300 px-2">✕</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase">Trim from (s)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={c.trimStart ?? ""}
                      onChange={(e) => updateClip(i, { trimStart: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase">Trim to (s)</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={c.trimEnd ?? ""}
                      onChange={(e) => updateClip(i, { trimEnd: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs"
                      dir="ltr"
                    />
                  </div>
                  {i < clips.length - 1 && (
                    <>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase">מעבר לבא</label>
                        <select
                          value={c.transition}
                          onChange={(e) => updateClip(i, { transition: e.target.value as any })}
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs"
                        >
                          <option value="cut">cut (חיתוך חד)</option>
                          <option value="fade">fade (החשכה)</option>
                          <option value="dissolve">dissolve (התמזגות)</option>
                          <option value="ai-luma">🤖 AI Luma (~$0.40)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase">משך מעבר (s)</label>
                        <input
                          type="number" step="0.1" min="0" max="3"
                          value={c.transitionDur}
                          onChange={(e) => updateClip(i, { transitionDur: Number(e.target.value) })}
                          disabled={c.transition === "cut"}
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs disabled:opacity-40"
                          dir="ltr"
                        />
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Step 3: Audio */}
      {clips.length > 0 && (
        <Section step={3} title="אודיו">
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={audioMode === "keep"} onChange={() => setAudioMode("keep")} />
              <span className="text-white">שמור אודיו מקורי</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={audioMode === "mute"} onChange={() => setAudioMode("mute")} />
              <span className="text-white">השתק לחלוטין</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={audioMode === "track"} onChange={() => setAudioMode("track")} />
              <span className="text-white">העלה פס קול חיצוני (יחליף את המקורי)</span>
            </label>
            {audioMode === "track" && (
              <div className="mt-2 mr-6">
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav"
                  onChange={(e) => e.target.files?.[0] && handleAudioFile(e.target.files[0])}
                  className="text-xs text-slate-300"
                />
                {audioTrackUrl && <div className="text-[11px] text-emerald-300 mt-1">✓ פס קול הועלה</div>}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={audioMode === "narration"} onChange={() => setAudioMode("narration")} />
              <span className="text-white">🎙 קריינות AI (Gemini TTS)</span>
            </label>
            {audioMode === "narration" && (
              <div className="mt-2 mr-6 space-y-2">
                <textarea
                  value={narrationText}
                  onChange={(e) => setNarrationText(e.target.value)}
                  placeholder="טקסט הקריינות (עברית/אנגלית, עד ~4000 תווים)"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={narrationVoice}
                    onChange={(e) => setNarrationVoice(e.target.value as any)}
                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-white text-xs"
                  >
                    <option value="Aoede">Aoede (נשי, חמים)</option>
                    <option value="Kore">Kore (נשי, רגוע)</option>
                    <option value="Charon">Charon (זכרי, עמוק)</option>
                    <option value="Fenrir">Fenrir (זכרי, חזק)</option>
                    <option value="Puck">Puck (זכרי, צעיר)</option>
                  </select>
                  <button
                    type="button"
                    disabled={!narrationText.trim() || narrationGenerating}
                    onClick={async () => {
                      setNarrationGenerating(true); setErr("");
                      try {
                        const res = await fetch("/api/v1/learn/video/tts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...adminHeaders() },
                          body: JSON.stringify({ text: narrationText, voice: narrationVoice }),
                        });
                        const j = await res.json();
                        if (!res.ok || !j.ok) throw new Error(j.error || "TTS failed");
                        setAudioTrackUrl(j.blobUrl);
                      } catch (e: any) {
                        setErr(e?.message || "TTS error");
                      } finally {
                        setNarrationGenerating(false);
                      }
                    }}
                    className="text-xs bg-purple-500 hover:bg-purple-400 text-white font-semibold px-3 py-1.5 rounded disabled:opacity-50"
                  >
                    {narrationGenerating ? "🔄 מסנתז…" : "🎙 חולל קריינות"}
                  </button>
                </div>
                {audioTrackUrl && audioMode === "narration" && (
                  <div className="text-[11px] text-emerald-300">
                    ✓ קריינות מוכנה — <audio controls src={audioTrackUrl} className="inline-block align-middle h-6" />
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Step 4: Engine */}
      {clips.length > 0 && (
        <Section step={4} title="מנוע מיזוג">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EngineCard
              active={engine === "wasm"}
              onClick={() => setEngine("wasm")}
              recommended={!recommendShotstack}
              icon="🧩"
              title="FFmpeg.wasm (חינם, בדפדפן)"
              desc="רץ במחשב שלך. עד ~500MB ו-10 דקות. אפס עלות, אפס תלות בשרת."
            />
            <EngineCard
              active={engine === "shotstack"}
              onClick={() => setEngine("shotstack")}
              recommended={recommendShotstack}
              icon="☁️"
              title="Shotstack Cloud (בתשלום)"
              desc="רינדור בענן. מהיר, תומך בקבצים גדולים. ~$0.30 לדקה."
            />
          </div>
        </Section>
      )}

      {/* Timeline preview (Premiere-style) */}
      {clips.length > 0 && (
        <Section step={5} title="ציר זמן (תצוגה מקדימה)">
          <EditTimeline
            clips={clips.map((c) => ({
              filename: c.filename,
              durationSec: c.durationSec,
              trimStart: c.trimStart,
              trimEnd: c.trimEnd,
              transition: c.transition,
              transitionDur: c.transitionDur,
            }))}
            audioMode={audioMode}
            audioTrackUrl={audioTrackUrl}
            techSpecs={{ resolution: "1280x720", fps: 30, codec: "H.264 + AAC", aspectRatio: "16:9" }}
          />
        </Section>
      )}

      {/* Step 6: Run + progress */}
      {clips.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={startMerge}
            disabled={running || uploading || clips.length < 2}
            className="w-full bg-gradient-to-l from-purple-500 to-cyan-500 hover:opacity-90 text-white font-bold px-6 py-3 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? "🔄 ממזג…" : `🚀 מזג ${clips.length} clips → סרטון אחד`}
          </button>

          {running && (
            <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-4">
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-l from-cyan-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${Math.max(3, progressPct)}%` }}
                />
              </div>
              <div className="text-xs text-slate-300 text-center">{progressPct}% · {progressMsg}</div>
            </div>
          )}

          {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-3 text-sm">⚠ {err}</div>}
        </div>
      )}
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">
        <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full px-2 py-0.5 text-[10px] mr-2">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function EngineCard({ active, onClick, recommended, icon, title, desc }: { active: boolean; onClick: () => void; recommended: boolean; icon: string; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-right p-4 rounded-xl border transition ${
        active ? "border-cyan-500 bg-cyan-500/10" : "border-slate-700 bg-slate-950/40 hover:border-slate-600"
      }`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-sm font-bold text-white flex items-center gap-2">
        {title}
        {recommended && <span className="text-[9px] uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded">מומלץ</span>}
      </div>
      <div className="text-xs text-slate-400 mt-1">{desc}</div>
    </button>
  );
}

async function probeVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(v.src);
      resolve(isFinite(d) ? d : undefined);
    };
    v.onerror = () => resolve(undefined);
    v.src = URL.createObjectURL(file);
  });
}
