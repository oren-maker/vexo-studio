"use client";

// 🧪 Scene Studio — standalone experimentation page (NOT connected to DB)
// Copy of the real scene page's creation UX, but isolated for testing
// video + soundtrack integration. Data seeded from Episode 1 Scene 1.

import { useEffect, useRef, useState } from "react";

// Hardcoded snapshot from real data: Episode 1 "Shattered Reflections" → Scene 1 "The Descent"
const SEED_SCENE = {
  id: "cmo2ayw3d0001d2620skafbia",
  sceneNumber: 1,
  title: "The Descent",
  episodeTitle: "Shattered Reflections",
  episodeNumber: 1,
  scriptText: `[00:00-00:02] Title Card: SEASON 1 · EPISODE 1.
[00:02-00:08] A crane shot descends through dense clouds over a monolithic city at dawn. Neon signs flicker through the mist.
[00:08-00:14] Camera tracks through a tall window into an apartment — a MAN stands before a tall mirror, buttoning a crisp shirt.
[00:14-00:20] CLOSE-UP on his reflection. The reflection's eyes hold a moment too long, then smile without him.
[00:20-00:24] Wide shot: he steps back, unsettled. Rain streaks the window behind him.
[00:24-00:30] Hard cut to black. SFX: a low, metallic hum rises and then abruptly stops.`,
};

const VIDEO_MODELS = [
  { id: "sora-2", name: "Sora 2", icon: "🎥", rate: 0.10, durations: [5, 10, 15, 20], resolution: "720p", native_audio: true },
  { id: "sora-2-pro", name: "Sora 2 Pro", icon: "💎", rate: 0.30, durations: [5, 10, 15, 20], resolution: "1080p", native_audio: true },
  { id: "kling-v2.1-pro", name: "Kling 2.1 Pro", icon: "🎬", rate: 0.274, durations: [5, 10], resolution: "1080p", native_audio: false },
  { id: "seedance-v1-pro", name: "Seedance 2", icon: "⚡", rate: 0.047, durations: [5, 10], resolution: "1080p", native_audio: false },
  { id: "soul-standard", name: "Soul", icon: "✨", rate: 0.005, durations: [5], resolution: "720p", native_audio: false },
  { id: "higgs-dop", name: "DoP Preview", icon: "📽", rate: 0.005, durations: [5], resolution: "720p", native_audio: false },
];

type AudioSample = { time: number; volume: number };

function AudioVisualizer({
  videoEl,
  audioEl,
  duration,
}: {
  videoEl: HTMLVideoElement | null;
  audioEl: HTMLAudioElement | null;
  duration: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  // Animate playhead from video time
  useEffect(() => {
    if (!videoEl) return;
    const update = () => setCurrentTime(videoEl.currentTime);
    videoEl.addEventListener("timeupdate", update);
    return () => videoEl.removeEventListener("timeupdate", update);
  }, [videoEl]);

  // Analyze audio peaks from uploaded audio
  useEffect(() => {
    if (!audioEl?.src) { setSamples([]); return; }
    (async () => {
      try {
        const res = await fetch(audioEl.src);
        const buf = await res.arrayBuffer();
        // @ts-ignore
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const audio = await ctx.decodeAudioData(buf);
        const data = audio.getChannelData(0);
        const bucketCount = 120; // ~120 bars for the strip
        const bucketSize = Math.floor(data.length / bucketCount);
        const peaks: AudioSample[] = [];
        const dur = audio.duration || duration || 30;
        for (let i = 0; i < bucketCount; i++) {
          let max = 0;
          const start = i * bucketSize;
          for (let j = 0; j < bucketSize; j++) max = Math.max(max, Math.abs(data[start + j] || 0));
          peaks.push({ time: (i / bucketCount) * dur, volume: max });
        }
        setSamples(peaks);
        ctx.close();
      } catch (e) {
        console.warn("audio decode failed", e);
      }
    })();
  }, [audioEl?.src, duration]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx2.clearRect(0, 0, w, h);
    // Background
    ctx2.fillStyle = "#0f172a";
    ctx2.fillRect(0, 0, w, h);
    // Bars
    if (samples.length > 0) {
      const barWidth = w / samples.length;
      samples.forEach((s, i) => {
        const barH = Math.max(2, s.volume * (h - 16));
        // Color by volume level: green=low, amber=mid, red=high
        const color = s.volume > 0.7 ? "#ef4444" : s.volume > 0.4 ? "#f59e0b" : "#10b981";
        ctx2.fillStyle = color;
        ctx2.fillRect(i * barWidth, (h - barH) / 2, barWidth - 1, barH);
      });
    }
    // Time markers every second
    const totalSec = Math.max(duration, 1);
    const pxPerSec = w / totalSec;
    ctx2.strokeStyle = "#334155";
    ctx2.fillStyle = "#94a3b8";
    ctx2.font = "10px monospace";
    for (let s = 0; s <= totalSec; s++) {
      const x = s * pxPerSec;
      ctx2.beginPath();
      ctx2.moveTo(x, h - 14);
      ctx2.lineTo(x, h);
      ctx2.stroke();
      if (s % 2 === 0) ctx2.fillText(`${s}s`, x + 2, h - 2);
    }
    // Playhead
    if (currentTime > 0 && totalSec > 0) {
      const x = (currentTime / totalSec) * w;
      ctx2.strokeStyle = "#06b6d4";
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.moveTo(x, 0);
      ctx2.lineTo(x, h);
      ctx2.stroke();
    }
  }, [samples, currentTime, duration]);

  const avgVol = samples.length ? samples.reduce((s, x) => s + x.volume, 0) / samples.length : 0;
  const peakVol = samples.length ? Math.max(...samples.map((s) => s.volume)) : 0;

  return (
    <div className="bg-bg-card border border-bg-main rounded-lg p-3 mt-3">
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold">🔊 פסקול</span>
          <span className="text-text-muted">משך: {duration.toFixed(1)}s</span>
          <span className="text-text-muted">ממוצע עוצמה: <b className="text-emerald-500">{(avgVol * 100).toFixed(0)}%</b></span>
          <span className="text-text-muted">שיא: <b className="text-red-500">{(peakVol * 100).toFixed(0)}%</b></span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full" />שקט</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" />בינוני</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full" />חזק</span>
        </div>
      </div>
      <canvas ref={canvasRef} width={800} height={120} className="w-full rounded border border-bg-main" />
      {samples.length === 0 && (
        <div className="text-center text-xs text-text-muted py-2">טען קובץ אודיו כדי לראות ויזואליזציה של העוצמות</div>
      )}
    </div>
  );
}

export default function SceneStudioLab() {
  const [selectedModel, setSelectedModel] = useState(VIDEO_MODELS[0]);
  const [duration, setDuration] = useState(10);
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [videoPrompt, setVideoPrompt] = useState(SEED_SCENE.scriptText);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const estimatedCost = selectedModel.rate * duration;

  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setVideoFile(f);
    setVideoUrl(URL.createObjectURL(f));
  }

  function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioFile(f);
    setAudioUrl(URL.createObjectURL(f));
  }

  function toggleSync() {
    if (!videoRef.current || !audioRef.current) return;
    if (playing) {
      videoRef.current.pause();
      audioRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.currentTime = 0;
      audioRef.current.currentTime = 0;
      videoRef.current.play();
      audioRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <div className="min-h-screen bg-bg-main text-text-primary p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-text-muted">🧪 מעבדה · אין חיבור ל-DB</div>
            <h1 className="text-3xl font-bold mt-1">Scene Studio Lab</h1>
            <div className="text-sm text-text-muted mt-1">
              📍 SC{String(SEED_SCENE.sceneNumber).padStart(2, "0")}: <b>{SEED_SCENE.title}</b> · פרק {SEED_SCENE.episodeNumber} — {SEED_SCENE.episodeTitle}
            </div>
          </div>
          <div className="text-xs text-text-muted font-mono bg-bg-card px-3 py-1.5 rounded border border-bg-main">
            scene id: {SEED_SCENE.id.slice(0, 12)}...
          </div>
        </header>

        {/* Script */}
        <section className="bg-bg-card border border-bg-main rounded-card p-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2">📝 תסריט הסצנה</h2>
          <textarea
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            rows={8}
            className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm font-mono resize-y"
          />
        </section>

        {/* Video generation controls */}
        <section className="bg-bg-card border border-bg-main rounded-card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">🎥 יצירת וידאו</h2>

          {/* Model picker */}
          <div>
            <div className="text-xs font-semibold mb-2">מודל</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {VIDEO_MODELS.map((m) => {
                const isSelected = m.id === selectedModel.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m)}
                    className={`text-right px-3 py-2 rounded-lg border-2 transition text-sm ${
                      isSelected ? "border-accent bg-accent/10" : "border-bg-main bg-bg-main hover:border-accent/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{m.icon} {m.name}</span>
                      {m.native_audio && <span className="text-[9px] bg-emerald-500/20 text-emerald-600 px-1.5 rounded">🔊 audio</span>}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">${m.rate}/שנייה · עד {m.durations[m.durations.length - 1]}s · {m.resolution}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration + aspect */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold mb-2">משך: <b>{duration}s</b></div>
              <input
                type="range"
                min={5}
                max={selectedModel.durations[selectedModel.durations.length - 1]}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="text-xs font-semibold mb-2">יחס</div>
              <div className="flex gap-2">
                {(["16:9", "9:16"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm border-2 ${
                      aspect === a ? "border-accent bg-accent/10" : "border-bg-main bg-bg-main"
                    }`}
                  >
                    {a === "16:9" ? "🖥 16:9" : "📱 9:16"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cost + generate button */}
          <div className="flex items-center justify-between pt-2 border-t border-bg-main">
            <div className="text-sm">
              עלות משוערת: <b className="text-accent">${estimatedCost.toFixed(2)}</b>
              <span className="text-xs text-text-muted mr-2">
                ({duration}s × ${selectedModel.rate}/s)
              </span>
            </div>
            <div className="flex gap-2">
              <label className="px-4 py-2 rounded-lg bg-bg-main border border-bg-main cursor-pointer text-sm font-semibold hover:bg-accent/10">
                📁 העלה MP4
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
              </label>
              <button
                disabled
                className="px-4 py-2 rounded-lg bg-accent/30 text-white text-sm font-semibold cursor-not-allowed"
                title="במעבדה — לא מחובר ל-API"
              >
                🎬 צור (כבוי)
              </button>
            </div>
          </div>
        </section>

        {/* Video + Audio player */}
        {videoUrl && (
          <section className="bg-bg-card border border-bg-main rounded-card p-4">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">🎞 תצוגה משולבת</h2>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full rounded-lg bg-black"
              controls
              onPlay={() => { if (audioRef.current) audioRef.current.play(); setPlaying(true); }}
              onPause={() => { if (audioRef.current) audioRef.current.pause(); setPlaying(false); }}
              onSeeked={() => { if (audioRef.current && videoRef.current) audioRef.current.currentTime = videoRef.current.currentTime; }}
            />

            {/* Audio visualizer strip */}
            <AudioVisualizer
              videoEl={videoRef.current}
              audioEl={audioRef.current}
              duration={duration}
            />

            {/* Audio upload */}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <label className="px-3 py-1.5 rounded-lg bg-bg-main border border-bg-main cursor-pointer text-xs font-semibold hover:bg-accent/10">
                🎵 טען פסקול
                <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
              </label>
              {audioFile && (
                <>
                  <span className="text-xs text-text-muted">{audioFile.name}</span>
                  <button
                    onClick={toggleSync}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold"
                  >
                    {playing ? "⏸ עצור" : "▶️ סנכרן + נגן"}
                  </button>
                </>
              )}
            </div>

            {audioUrl && (
              <audio ref={audioRef} src={audioUrl} className="hidden" />
            )}
          </section>
        )}

        {!videoUrl && (
          <section className="bg-bg-card border border-dashed border-bg-main rounded-card p-10 text-center">
            <div className="text-5xl mb-3">🎬</div>
            <div className="text-sm text-text-muted">העלה MP4 או צור וידאו כדי להתחיל בניסוי</div>
          </section>
        )}

        <footer className="text-center text-xs text-text-muted pt-8">
          🧪 מעבדת Scene Studio · ניסוי בלבד · לא מחובר ל-DB או לסצנה האמיתית
        </footer>
      </div>
    </div>
  );
}
