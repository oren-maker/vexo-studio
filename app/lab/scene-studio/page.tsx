"use client";

// 🧪 Scene Studio Lab — standalone experimentation page (NOT connected to DB)
// Mirrors the real scene page's UX: director notes, sound notes, AI critic,
// video generation modal. For testing video+audio integration.

import { useEffect, useRef, useState } from "react";

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
  directorNotes: `- שמור על חיוך של ההשתקפות למקסימום 0.3 שניות (כדי שיהיה "האם ראיתי את זה?" לא ברור).
- המצלמה שולטת מעל הגיבור בסצנה 8-14s — הוא קטן יחסית לחדר.
- גשם זורם אופקי על החלון, לא אנכי (לחץ רוח).`,
  soundNotes: `[00:00-00:02] Title music — cold, synth pad, single sustained note in D minor (low volume, 25%).
[00:02-00:08] City ambience: distant traffic, one subway rumble at 00:05. Wind.
[00:08-00:14] Footsteps on wooden floor (soft). Fabric rustle. Heart-beat sub-bass starts fading in at 00:13 (very quiet, 10%).
[00:14-00:20] Complete silence except the heartbeat (rising to 40%).
[00:20-00:24] Rain on glass (heavy but dampened — interior POV).
[00:24-00:30] Metallic hum: starts 5 Hz sub, rises to 200 Hz over 3s, cuts at 00:29.5. TOTAL silence after.`,
  critic: { score: 0.82, feedback: "התסריט מצוין — המקצב של השתקפות ששיחקת עם הזמן יוצר מתח פסיכולוגי. בדוק: שמור על ההרגשה של 'משהו לא בסדר' בלי לרמוז יותר מדי. העיתוי של ההחזר המטאלי ב-00:24 — אולי הקדם ל-00:22 כדי לקשר חזותית לנטילת ההלם של הגיבור." },
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

function AudioVisualizer({ videoEl, audioEl, duration }: { videoEl: HTMLVideoElement | null; audioEl: HTMLAudioElement | null; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!videoEl) return;
    const update = () => setCurrentTime(videoEl.currentTime);
    videoEl.addEventListener("timeupdate", update);
    return () => videoEl.removeEventListener("timeupdate", update);
  }, [videoEl]);

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
        const bucketCount = 120;
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
      } catch {}
    })();
  }, [audioEl?.src, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx2.clearRect(0, 0, w, h);
    ctx2.fillStyle = "#0f172a";
    ctx2.fillRect(0, 0, w, h);
    if (samples.length > 0) {
      const barWidth = w / samples.length;
      samples.forEach((s, i) => {
        const barH = Math.max(2, s.volume * (h - 16));
        const color = s.volume > 0.7 ? "#ef4444" : s.volume > 0.4 ? "#f59e0b" : "#10b981";
        ctx2.fillStyle = color;
        ctx2.fillRect(i * barWidth, (h - barH) / 2, barWidth - 1, barH);
      });
    }
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
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 mt-3">
      <div className="flex items-center justify-between mb-2 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <span className="font-semibold">🔊 פסקול</span>
          <span>משך: {duration.toFixed(1)}s</span>
          <span>ממוצע: <b className="text-emerald-400">{(avgVol * 100).toFixed(0)}%</b></span>
          <span>שיא: <b className="text-red-400">{(peakVol * 100).toFixed(0)}%</b></span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full" />שקט</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full" />בינוני</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full" />חזק</span>
        </div>
      </div>
      <canvas ref={canvasRef} width={800} height={120} className="w-full rounded border border-slate-700" />
      {samples.length === 0 && <div className="text-center text-xs text-slate-500 py-2">טען קובץ אודיו לראות ויזואליזציה</div>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg-card border border-bg-main rounded-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <div className="text-[11px] text-text-muted mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

export default function SceneStudioLab() {
  const [scriptText, setScriptText] = useState(SEED_SCENE.scriptText);
  const [directorNotes, setDirectorNotes] = useState(SEED_SCENE.directorNotes);
  const [soundNotes, setSoundNotes] = useState(SEED_SCENE.soundNotes);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(VIDEO_MODELS[0]);
  const [duration, setDuration] = useState(10);
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const estimatedCost = selectedModel.rate * duration;
  const hasDialogue = /[A-Z]+:\s/.test(scriptText);
  const needsVeoWarning = hasDialogue && !selectedModel.native_audio;

  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setVideoFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setGenerateOpen(false);
  }

  function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
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
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-text-muted">🧪 מעבדה · לא מחובר ל-DB</div>
            <h1 className="text-3xl font-bold mt-1">Scene Studio Lab</h1>
            <div className="text-sm text-text-muted mt-1">
              📍 SC{String(SEED_SCENE.sceneNumber).padStart(2, "0")}: <b>{SEED_SCENE.title}</b> · פרק {SEED_SCENE.episodeNumber} — {SEED_SCENE.episodeTitle}
            </div>
          </div>
          <button
            onClick={() => setGenerateOpen(true)}
            className="px-5 py-3 rounded-lg bg-accent hover:bg-accent-light text-white font-semibold text-sm shadow-card"
          >
            🎬 צור וידאו
          </button>
        </header>

        {/* Script */}
        <Card title="📝 תסריט הסצנה" subtitle="טקסט עם timecodes שיוזן לפרומפט של הוידאו">
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            rows={8}
            className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm font-mono resize-y border border-bg-main focus:border-accent/60 outline-none"
          />
        </Card>

        {/* Director notes */}
        <Card title="📝 הערות במאי (ידני)" subtitle="הערות שיתווספו לפרומפט של הוידאו — מעל הדף האוטומטי">
          <textarea
            value={directorNotes}
            onChange={(e) => setDirectorNotes(e.target.value)}
            rows={5}
            className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm resize-y border border-bg-main focus:border-accent/60 outline-none"
          />
        </Card>

        {/* Sound notes */}
        <Card title="🔊 הערות סאונד" subtitle="מוזיקה · אפקטים · דיבוב. ה-AI יצרף את זה ל-[Audio] של הוידאו">
          <div className="flex items-center justify-end mb-2">
            <button disabled className="px-3 py-1.5 rounded-lg bg-accent/30 text-white text-xs font-semibold cursor-not-allowed" title="כבוי במעבדה">
              ✨ ייצר עם AI (כבוי)
            </button>
          </div>
          <textarea
            value={soundNotes}
            onChange={(e) => setSoundNotes(e.target.value)}
            rows={8}
            className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm font-mono resize-y border border-bg-main focus:border-accent/60 outline-none"
          />
        </Card>

        {/* AI Critic */}
        <Card title="🧐 מבקר AI" subtitle={`1 ${"ביקורת"}`}>
          <div className="bg-bg-main border border-bg-main rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-text-muted">Script review · Gemini 2.5 Pro</div>
              <div className="text-lg font-bold text-accent">{(SEED_SCENE.critic.score * 100).toFixed(0)}/100</div>
            </div>
            <div className="text-sm text-text-secondary leading-relaxed">{SEED_SCENE.critic.feedback}</div>
          </div>
          <button disabled className="mt-3 px-3 py-1.5 rounded-lg bg-accent/30 text-white text-xs font-semibold cursor-not-allowed" title="כבוי במעבדה">
            🔁 ייצר ביקורת חדשה (כבוי)
          </button>
        </Card>

        {/* Video player — only visible after upload/generate */}
        {videoUrl && (
          <Card title="🎞 תצוגה משולבת — וידאו + סאונד">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full rounded-lg bg-black"
              controls
              onPlay={() => { if (audioRef.current) audioRef.current.play(); setPlaying(true); }}
              onPause={() => { if (audioRef.current) audioRef.current.pause(); setPlaying(false); }}
              onSeeked={() => { if (audioRef.current && videoRef.current) audioRef.current.currentTime = videoRef.current.currentTime; }}
            />
            <AudioVisualizer videoEl={videoRef.current} audioEl={audioRef.current} duration={duration} />
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <label className="px-3 py-1.5 rounded-lg bg-bg-main border border-bg-main cursor-pointer text-xs font-semibold hover:bg-accent/10">
                🎵 טען פסקול
                <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
              </label>
              {audioFile && (
                <>
                  <span className="text-xs text-text-muted">{audioFile.name}</span>
                  <button onClick={toggleSync} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold">
                    {playing ? "⏸ עצור" : "▶️ סנכרן + נגן"}
                  </button>
                </>
              )}
              {videoFile && <span className="text-xs text-text-muted mr-auto">🎥 {videoFile.name}</span>}
            </div>
            {audioUrl && <audio ref={audioRef} src={audioUrl} className="hidden" />}
          </Card>
        )}

        {!videoUrl && (
          <div className="bg-bg-card border border-dashed border-bg-main rounded-card p-10 text-center">
            <div className="text-5xl mb-3">🎬</div>
            <div className="text-sm text-text-muted mb-3">לחץ &quot;צור וידאו&quot; כדי לפתוח את בחירת המודל, או העלה MP4 לבדיקה</div>
            <button onClick={() => setGenerateOpen(true)} className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-semibold">
              🎬 צור וידאו
            </button>
          </div>
        )}

        <footer className="text-center text-xs text-text-muted pt-8">
          🧪 מעבדת Scene Studio · ניסוי בלבד · לא מחובר ל-DB או לסצנה האמיתית
        </footer>
      </div>

      {/* Generate video modal — opens only when clicking "צור וידאו" */}
      {generateOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={() => setGenerateOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-bg-card rounded-card shadow-card border border-bg-main w-full max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
            <div className="px-5 py-3 border-b border-bg-main flex items-center justify-between">
              <div className="font-semibold">🎬 יצירת וידאו</div>
              <button onClick={() => setGenerateOpen(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Model */}
              <div>
                <div className="text-xs font-semibold mb-2">מודל</div>
                <div className="grid grid-cols-2 gap-2">
                  {VIDEO_MODELS.map((m) => {
                    const isSelected = m.id === selectedModel.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => { setSelectedModel(m); if (duration > m.durations[m.durations.length - 1]) setDuration(m.durations[m.durations.length - 1]); }}
                        className={`text-right px-3 py-2 rounded-lg border-2 transition text-sm ${isSelected ? "border-accent bg-accent/10" : "border-bg-main bg-bg-main hover:border-accent/40"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{m.icon} {m.name}</span>
                          {m.native_audio && <span className="text-[9px] bg-emerald-500/20 text-emerald-600 px-1.5 rounded">🔊</span>}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">${m.rate}/s · עד {m.durations[m.durations.length - 1]}s · {m.resolution}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {needsVeoWarning && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  ⚠ המודל הזה יוצר וידאו ללא סאונד. בסצנה יש דיאלוג — בחר Sora 2 / Sora 2 Pro לסאונד נטיב.
                </div>
              )}

              {/* Duration */}
              <div>
                <div className="text-xs font-semibold mb-2">משך: <b>{duration}s</b> / מקסימום {selectedModel.durations[selectedModel.durations.length - 1]}s</div>
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

              {/* Aspect */}
              <div>
                <div className="text-xs font-semibold mb-2">יחס</div>
                <div className="flex gap-2">
                  {(["16:9", "9:16"] as const).map((a) => (
                    <button key={a} onClick={() => setAspect(a)} className={`flex-1 px-3 py-2 rounded-lg text-sm border-2 ${aspect === a ? "border-accent bg-accent/10" : "border-bg-main bg-bg-main"}`}>
                      {a === "16:9" ? "🖥 16:9" : "📱 9:16"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost */}
              <div className="bg-bg-main border border-bg-main rounded-lg p-3 text-center">
                <div className="text-xs text-text-muted">עלות משוערת</div>
                <div className="text-3xl font-black text-accent num">${estimatedCost.toFixed(2)}</div>
                <div className="text-[11px] text-text-muted mt-1">{duration}s × ${selectedModel.rate}/שנייה</div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-bg-main flex gap-2">
              <label className="flex-1 px-4 py-2 rounded-lg bg-bg-main border border-bg-main cursor-pointer text-sm font-semibold hover:bg-accent/10 text-center">
                📁 העלה MP4 במקום
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
              </label>
              <button disabled className="flex-1 px-4 py-2 rounded-lg bg-accent/30 text-white text-sm font-semibold cursor-not-allowed" title="כבוי במעבדה">
                🎬 צור ב-{selectedModel.name} (כבוי)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
