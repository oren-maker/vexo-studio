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
  scriptText: "",
  synopsis: `סצנת הפתיחה של הסדרה. בוקר גשום בעיר המונוליטית. הגיבור — מיקאל — מתלבש מול המראה כשההשתקפות שלו מתנהגת באופן עצמאי לרגע. זו הרמיזה הראשונה לכך שהמציאות סביבו נסדקת. מאיה, חברתו, נוכחת בדירה ברקע — גיבורת-משנה שתהפוך למובילה בהמשך העונה.`,
  plot: `🎬 עלילה מקרוסקופית — העונה הראשונה עוקבת אחרי מיקאל (איש ארכיטקט 34) שמגלה שהמציאות שלו מבוצעת מחדש בכל בוקר ע"י AI לא ידוע. מאיה (28, מדענית נוירו-מדעית) היא היחידה ששמה לב לסדקים — היא הופכת למובילה מדעית של החקירה. הסצנה הזו היא הטריגר: החיוך של ההשתקפות הוא ה"באג" הראשון שמיקאל רואה.

🎯 מטרת הסצנה:
1. לבסס אווירה פסיכולוגית (מראה + השתקפות לא צייתנית)
2. להציג את מיקאל ללא דיאלוג — רק ויזואליה
3. להרמיז על מאיה ברקע (כרגע לא ברור שהיא תהיה חשובה)
4. להטמיע את הצליל המטאלי שיחזור לאורך כל העונה כמוטיב`,
  characters: [
    {
      id: "mikael",
      name: "Mikael (מיקאל)",
      role: "Protagonist",
      age: 34,
      description: "ארכיטקט בכיר, גבוה (185 ס״מ), שיער חום קצר, עיניים חומות, זקן קצר מוזנח. בוקר: חולצה לבנה מקורצפת, מכנסיים שחורים, מבט מהורהר. התנהגות: מאופק, מדוד, כמעט חרד — כמו מישהו שתמיד חש שמשהו עוקב אחריו.",
      visualRef: "Timothée Chalamet מתוך Dune, במשקל יותר",
    },
    {
      id: "maya",
      name: "Maya (מאיה)",
      role: "Deuteragonist",
      age: 28,
      description: "מדענית נוירו-מדע, שיער שחור מתולתל באורך כתפיים, עיניים ירוקות חדות, משקפיים מרובעים. לובשת סוודר כחול כהה + מכנסי ג'ינס כהים + גרביים בצבע אדום חם. ביד: ספל קפה מאיד. התנהגות: ערנית, סקרנית, מהירה להבחין בפרטים. לא בסצנה הזו במרכז אבל תופיע ברקע חולפת דרך המסדרון ב-00:16 (0.5 שניות).",
      visualRef: "Zendaya × Florence Pugh, mixed — כהה יותר ורצינית",
    },
  ],
  directorNotes: `- שמור על חיוך של ההשתקפות למקסימום 0.3 שניות (כדי שיהיה "האם ראיתי את זה?" לא ברור).
- המצלמה שולטת מעל הגיבור בסצנה 8-14s — הוא קטן יחסית לחדר.
- גשם זורם אופקי על החלון, לא אנכי (לחץ רוח).
- מאיה חולפת ברקע ב-00:16 — רק צלליתה נראית ("blurry defocus"), היא לא במוקד.`,
  soundNotes: `[00:00-00:02] Title music — cold, synth pad, single sustained note in D minor (low volume, 25%).
[00:02-00:08] City ambience: distant traffic, one subway rumble at 00:05. Wind.
[00:08-00:14] Footsteps on wooden floor (soft). Fabric rustle. Heart-beat sub-bass starts fading in at 00:13 (very quiet, 10%).
[00:14-00:20] Complete silence except the heartbeat (rising to 40%).
[00:20-00:24] Rain on glass (heavy but dampened — interior POV).
[00:24-00:30] Metallic hum: starts 5 Hz sub, rises to 200 Hz over 3s, cuts at 00:29.5. TOTAL silence after.`,
  critic: { score: 0.82, feedback: "התסריט מצוין — המקצב של השתקפות ששיחקת עם הזמן יוצר מתח פסיכולוגי. בדוק: שמור על ההרגשה של 'משהו לא בסדר' בלי לרמוז יותר מדי. העיתוי של ההחזר המטאלי ב-00:24 — אולי הקדם ל-00:22 כדי לקשר חזותית לנטילת ההלם של הגיבור. רעיון: מאיה ברקע — אל תתן לה דיאלוג, אבל אולי תיצור שני פריימים שלה מסתכלת אל הדלת של החדר שלו (הרמזה)." },
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

// Build a Seedance-ready prompt focused on Maya for the opening scene context
function buildMayaSeedancePrompt(): string {
  return `1. VISUAL STYLE — Cinematic photoreal 8K psychological thriller, neo-noir aesthetic with soft volumetric morning mist. Gritty modern realism with sharp focal planes.

2. FILM STOCK & LENS — Shot on Arri Alexa 35 with 35mm anamorphic lens, f/1.8 aperture for buttery shallow depth of field, subtle horizontal lens flare from practical tungsten warm-light sources. Gentle film grain overlay.

3. COLOR PALETTE & GRADE — Dominated by deep midnight blue and rain-washed teal with punctuating warm amber from practical lamps. Crushed blacks in the hallway, muted skin tones, slight cyan shift in the shadows. Neo-noir color grading with gentle vignette.

4. LIGHTING & ATMOSPHERE — Moody diffused overcast dawn light filtering through floor-to-ceiling rain-streaked windows. Volumetric god-rays cutting through steam from a coffee mug. Single warm tungsten practical lamp in the background creating amber rim-light on hair. Wet-floor reflections catching the blue exterior light.

5. CHARACTER / SUBJECT — MAYA, 28-year-old neuroscientist. Shoulder-length curly black hair, sharp alert green eyes behind square minimalist glasses. Wearing a fitted navy-blue wool sweater, dark slim jeans, and warm coral-red socks visible above soft slippers. Holds a steaming white ceramic mug of coffee in both hands, thumb absently tracing the rim. Expression: attentive, almost predatory in its focus — slight tilt of head, eyes narrowing. Skin tone: warm olive. Makeup-free, a few freckles visible. Face and wardrobe remain fully consistent across every frame, no drift or morphing.

6. AUDIO / SOUND DESIGN — Soft bare-foot-to-wooden-floor soundscape (muted creaks). Distant city rain against glass in the background. Subtle ceramic ring as the mug settles against her palm. A low sub-bass heartbeat fading in barely perceptible at 3s. No dialogue. Ambient room tone: silent hum of a modern apartment.

7. TIMELINE — TIMECODED BEATS:
[0-2s] WIDE TRACKING SHOT — camera dollies slowly behind Maya as she walks barefoot down a dim narrow hallway. Steam coils from the mug. Warm amber practical glow pools around her silhouette. Sound: soft footsteps, distant rain.
[2-4s] MEDIUM PROFILE SHOT — she pauses at an open doorway, the half-open bedroom visible in deep background bokeh. She glances sideways into the dark room, head tilting 8 degrees. Rim-light catches the edge of her glasses. Sound: one single footstep stops, silence.
[4-5s] TIGHT CLOSE-UP — Maya's face fills the frame. Her green eyes narrow by a fraction of a millimeter, pupils contracting. A single drop of steam curls upward past her cheek. The subtle sub-bass heartbeat peaks and cuts to silence. She exhales — a barely visible puff in the cool air.

8. QUALITY BOOSTERS — Photorealistic 8K, ultra-detailed hair strands, perfect volumetric steam simulation, consistent character identity across all cuts, perfect motion blur on camera movement, high dynamic range, cinematic bokeh circles from background practicals, no artifacts, no morphing, no warped hands, no extra fingers.`;
}

type LabVideo = {
  id: string;
  number: number;
  requestId: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  videoUrl: string | null;
  prompt: string;
  model: string;
  durationSec: number;
  createdAt: string;
  error?: string;
};

export default function SceneStudioLab() {
  const [scriptText, setScriptText] = useState(SEED_SCENE.scriptText);
  const [directorNotes, setDirectorNotes] = useState(SEED_SCENE.directorNotes);
  const [soundNotes, setSoundNotes] = useState(SEED_SCENE.soundNotes);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(VIDEO_MODELS.find((m) => m.id === "seedance-v1-pro") || VIDEO_MODELS[0]);
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // Video gallery (persisted to localStorage so videos survive refresh)
  const [videos, setVideos] = useState<LabVideo[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateErr, setGenerateErr] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState(buildMayaSeedancePrompt());

  // Maya reference images (fetched from DB Character "Maya")
  const [mayaRefs, setMayaRefs] = useState<{ id: string; fileUrl: string }[]>([]);
  const [selectedMayaRef, setSelectedMayaRef] = useState<string | null>(null);
  const [mayaAppearance, setMayaAppearance] = useState<string | null>(null);
  const [mayaLoadErr, setMayaLoadErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/lab/maya-refs")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setMayaLoadErr(d.error); return; }
        const imgs = (d.media || []).filter((m: any) => (m.mediaType || "").includes("image") || /\.(png|jpg|jpeg|webp)/i.test(m.fileUrl));
        setMayaRefs(imgs);
        if (imgs.length > 0) setSelectedMayaRef(imgs[0].fileUrl);
        if (d.appearance) setMayaAppearance(d.appearance);
      })
      .catch((e) => setMayaLoadErr(String(e?.message || e)));
  }, []);

  useEffect(() => {
    // Merge server-generated videos (via curl) with local-generated (via UI)
    let local: LabVideo[] = [];
    try {
      const raw = localStorage.getItem("lab-videos");
      if (raw) local = JSON.parse(raw);
    } catch {}
    fetch("/api/v1/lab/videos")
      .then((r) => r.json())
      .then((d) => {
        const server: LabVideo[] = (d.videos || []).map((v: any) => ({
          id: v.id,
          number: v.number,
          requestId: v.requestId,
          status: v.status,
          videoUrl: v.videoUrl,
          prompt: v.note || "",
          model: v.model,
          durationSec: v.durationSec,
          createdAt: v.createdAt,
        }));
        // Merge — server first, then locals with numbers above max
        const maxServerNum = server.length ? Math.max(...server.map((s) => s.number)) : 0;
        const localsRenumbered = local.map((v, i) => ({ ...v, number: maxServerNum + i + 1 }));
        setVideos([...server, ...localsRenumbered]);
      })
      .catch(() => setVideos(local));
  }, []);

  useEffect(() => {
    try { localStorage.setItem("lab-videos", JSON.stringify(videos)); } catch {}
  }, [videos]);

  // Poll in-progress videos every 5s
  useEffect(() => {
    const inProgress = videos.filter((v) => v.status === "queued" || v.status === "in_progress");
    if (inProgress.length === 0) return;
    const timer = setInterval(async () => {
      for (const v of inProgress) {
        try {
          const r = await fetch(`/api/v1/lab/generate-video?id=${v.requestId}`);
          const data = await r.json();
          setVideos((prev) => prev.map((x) => x.requestId === v.requestId
            ? { ...x, status: data.status, videoUrl: data.videoUrl || x.videoUrl, error: data.error }
            : x
          ));
        } catch {}
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [videos]);

  async function generateWithMaya() {
    setGenerating(true);
    setGenerateErr(null);
    try {
      const res = await fetch("/api/v1/lab/generate-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: customPrompt,
          durationSeconds: duration,
          aspectRatio: aspect,
          imageUrl: selectedMayaRef, // image-to-video for character identity preservation
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const num = videos.length + 1;
      const newVid: LabVideo = {
        id: `lab-${Date.now()}`,
        number: num,
        requestId: data.requestId,
        status: data.status || "queued",
        videoUrl: null,
        prompt: customPrompt,
        model: data.model || "seedance",
        durationSec: duration,
        createdAt: new Date().toISOString(),
      };
      setVideos((v) => [...v, newVid]);
      setGenerateOpen(false);
    } catch (e: any) {
      setGenerateErr(e?.message || String(e));
    } finally {
      setGenerating(false);
    }
  }

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

        {/* Synopsis */}
        <Card title="📖 תקציר הסצנה" subtitle="מה קורה כאן — תמצית למנהלי הפקה">
          <p className="text-sm text-text-secondary leading-relaxed">{SEED_SCENE.synopsis}</p>
        </Card>

        {/* Plot — macro */}
        <Card title="🎬 עלילה" subtitle="הקשר רחב + מטרות הסצנה">
          <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{SEED_SCENE.plot}</div>
        </Card>

        {/* Characters */}
        <Card title="🎭 דמויות" subtitle={`${SEED_SCENE.characters.length} דמויות בסצנה`}>
          <div className="space-y-3">
            {SEED_SCENE.characters.map((c) => (
              <div key={c.id} className="bg-bg-main border border-bg-main rounded-lg p-3">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{c.name}</span>
                    <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded uppercase tracking-wider">{c.role}</span>
                    <span className="text-xs text-text-muted">גיל {c.age}</span>
                  </div>
                </div>
                <div className="text-sm text-text-secondary leading-relaxed">{c.description}</div>
                <div className="text-[11px] text-text-muted mt-2">🎨 רפרנס ויזואלי: {c.visualRef}</div>
              </div>
            ))}
          </div>
        </Card>

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

        {/* Video gallery — all generated + uploaded videos */}
        {videos.length > 0 && (
          <Card title={`🎥 וידאואים שנוצרו (${videos.length})`} subtitle="כל היצירות נשמרות ב-localStorage. מתעדכן אוטומטית בזמן ה-render">
            <div className="space-y-4">
              {videos.map((v) => (
                <div key={v.id} className="bg-bg-main border border-bg-main rounded-lg p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-accent text-white px-2 py-0.5 rounded text-xs font-bold">וידאו {v.number}</span>
                      <span className="text-xs text-text-muted">{v.model.split("/").pop()}</span>
                      <span className="text-xs text-text-muted">{v.durationSec}s · {new Date(v.createdAt).toLocaleString("he-IL")}</span>
                    </div>
                    <div>
                      {v.status === "completed" && <span className="text-xs bg-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded">✅ מוכן</span>}
                      {v.status === "in_progress" && <span className="text-xs bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded">⏳ בעבודה</span>}
                      {v.status === "queued" && <span className="text-xs bg-slate-500/20 text-slate-500 px-2 py-0.5 rounded">📥 בתור</span>}
                      {v.status === "failed" && <span className="text-xs bg-red-500/20 text-red-600 px-2 py-0.5 rounded">❌ נכשל</span>}
                    </div>
                  </div>
                  {v.videoUrl && (
                    <video src={v.videoUrl} controls className="w-full rounded bg-black" />
                  )}
                  {!v.videoUrl && v.status !== "failed" && (
                    <div className="h-32 flex items-center justify-center text-xs text-text-muted bg-black/20 rounded">
                      ⏳ Seedance מעבד את הווידאו... (~60-90 שניות)
                    </div>
                  )}
                  {v.error && <div className="text-xs text-red-500 mt-2">⚠ {v.error}</div>}
                  {v.videoUrl && (
                    <a href={v.videoUrl} target="_blank" rel="noopener" className="text-xs text-accent hover:underline mt-2 inline-block">
                      🔗 קישור ישיר
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Card>
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

              {/* Maya reference image picker */}
              <div>
                <div className="text-xs font-semibold mb-2">🎭 רפרנס של מאיה (image-to-video — שומר על הזהות)</div>
                {mayaLoadErr && <div className="text-xs text-amber-500 mb-2">⚠ {mayaLoadErr} — יפעל כ-text-to-video בלי רפרנס.</div>}
                {mayaRefs.length === 0 && !mayaLoadErr && <div className="text-xs text-text-muted mb-2">טוען תמונות של מאיה...</div>}
                {mayaRefs.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {mayaRefs.map((r) => {
                      const isSel = r.fileUrl === selectedMayaRef;
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedMayaRef(r.fileUrl)}
                          className={`shrink-0 rounded-lg border-2 overflow-hidden transition ${isSel ? "border-accent ring-2 ring-accent/40" : "border-bg-main opacity-60 hover:opacity-100"}`}
                        >
                          <img src={r.fileUrl} alt="Maya ref" className="w-20 h-20 object-cover" />
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedMayaRef && (
                  <div className="text-[10px] text-emerald-500">✅ Seedance image-to-video ישתמש בתמונה הנבחרת כפריים פתיחה — הפנים והלבוש יישמרו</div>
                )}
              </div>

              {/* Prompt preview — editable */}
              <div>
                <div className="text-xs font-semibold mb-2">📝 פרומפט (בנוי ממאיה + תסריט + הערות במאי)</div>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={10}
                  className="w-full bg-bg-main rounded-lg px-3 py-2 text-[11px] font-mono resize-y border border-bg-main"
                />
                <div className="text-[10px] text-text-muted mt-1">{customPrompt.split(/\s+/).length} מילים · כולל 8 סעיפים קולנועיים</div>
              </div>

              {/* Cost */}
              <div className="bg-bg-main border border-bg-main rounded-lg p-3 text-center">
                <div className="text-xs text-text-muted">עלות משוערת</div>
                <div className="text-3xl font-black text-accent num">${estimatedCost.toFixed(2)}</div>
                <div className="text-[11px] text-text-muted mt-1">{duration}s × ${selectedModel.rate}/שנייה</div>
              </div>

              {generateErr && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded p-2">⚠ {generateErr}</div>}
            </div>
            <div className="px-5 py-3 border-t border-bg-main flex gap-2">
              <label className="px-4 py-2 rounded-lg bg-bg-main border border-bg-main cursor-pointer text-sm font-semibold hover:bg-accent/10 text-center">
                📁 העלה MP4
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
              </label>
              <button
                onClick={generateWithMaya}
                disabled={generating}
                className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-semibold disabled:opacity-50"
              >
                {generating ? "⏳ שולח..." : `🎬 צור ב-Seedance 2 · $${estimatedCost.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
