"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";
import SyncProgress from "@/components/learn/sync-progress";

type LocalScene = {
  id?: string;
  startSec: number;
  endSec: number;
  thumbnailUrl: string | null;
  thumbnailBlob?: Blob;
  selected: boolean;
  aiRating?: number | null;
  aiReason?: string | null;
};

export default function TrimWorkflow() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [inputBlobUrl, setInputBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [totalDur, setTotalDur] = useState<number | null>(null);
  const [scenes, setScenes] = useState<LocalScene[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "detecting" | "ready" | "rating" | "exporting">("idle");
  const [detectMode, setDetectMode] = useState<"local" | "ai">("ai");
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [ratingJobId, setRatingJobId] = useState<string | null>(null);
  const [aiDetectJobId, setAiDetectJobId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function handleFile(f: File) {
    if (!getAdminKey()) { setErr("הגדר admin key ב-/admin"); return; }
    setErr(""); setFile(f); setFilename(f.name);
    try {
      // 1. Upload to Blob
      setPhase("uploading"); setProgressPct(2); setProgressMsg("מעלה ל-Blob…");
      const blob = await upload(`video-trim/${Date.now()}-${f.name}`, f, {
        access: "public",
        handleUploadUrl: "/api/video/upload",
        onUploadProgress: (p) => { setProgressPct(2 + Math.round(p.percentage * 0.18)); },
        headers: adminHeaders() as any,
      });
      setInputBlobUrl(blob.url);

      // AI mode: hand off to server, polling SyncJob takes over
      if (detectMode === "ai") {
        setPhase("detecting"); setProgressPct(25); setProgressMsg("Gemini מנתח את הוידאו…");
        const res = await fetch("/api/video/trim/ai-detect", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...adminHeaders() },
          body: JSON.stringify({ inputBlobUrl: blob.url, filename: f.name }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error || "ai-detect failed");
        setAiDetectJobId(j.jobId);
        return;
      }

      // 2. Local mode: run scene detection in browser
      setPhase("detecting"); setProgressPct(20); setProgressMsg("טוען FFmpeg.wasm…");
      const { detectScenes } = await import("@/lib/learn/scene-detection");
      const result = await detectScenes(f, {
        threshold: 0.4,
        onProgress: (pct, msg) => { setProgressPct(20 + Math.round(pct * 0.55)); setProgressMsg(msg); },
      });
      setTotalDur(result.totalDuration);

      // 3. Upload thumbnails to Blob (parallel)
      setProgressPct(78); setProgressMsg(`מעלה ${result.scenes.length} thumbnails…`);
      const sceneObjs: LocalScene[] = await Promise.all(
        result.scenes.map(async (s, i) => {
          const tName = `video-trim/${Date.now()}-thumb-${i}.jpg`;
          const tBlob = await upload(tName, new File([s.thumbnail], `thumb-${i}.jpg`, { type: "image/jpeg" }), {
            access: "public",
            handleUploadUrl: "/api/video/upload",
            headers: adminHeaders() as any,
          });
          return {
            startSec: s.startSec,
            endSec: s.endSec,
            thumbnailUrl: tBlob.url,
            selected: true,
          };
        }),
      );

      // 4. Persist session
      setProgressPct(92); setProgressMsg("שומר סשן…");
      const createRes = await fetch("/api/video/trim/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({
          inputBlobUrl: blob.url,
          filename: f.name,
          durationSec: result.totalDuration,
          scenes: sceneObjs.map((s) => ({ startSec: s.startSec, endSec: s.endSec, thumbnailUrl: s.thumbnailUrl })),
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.ok) throw new Error(createJson.error || "create session failed");
      setSessionId(createJson.session.id);
      setScenes(createJson.session.scenes.map((s: any) => ({ ...s, selected: true })));

      setPhase("ready"); setProgressPct(100); setProgressMsg("הושלם");
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
      setPhase("idle");
    }
  }

  async function runRating() {
    if (!sessionId) return;
    setErr(""); setPhase("rating");
    try {
      const res = await fetch(`/api/video/trim/sessions/${sessionId}/rate`, { method: "POST", headers: adminHeaders() });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "rating failed");
      if (j.jobId) setRatingJobId(j.jobId);
      else { await reloadSession(); setPhase("ready"); }
    } catch (e: any) {
      setErr(e?.message || "שגיאה"); setPhase("ready");
    }
  }

  async function reloadSession() {
    if (!sessionId) return;
    const res = await fetch(`/api/video/trim/sessions/${sessionId}`);
    if (!res.ok) return;
    const s = await res.json();
    setScenes(s.scenes);
  }

  function toggleScene(i: number) {
    setScenes(scenes.map((s, idx) => (idx === i ? { ...s, selected: !s.selected } : s)));
  }

  function selectAll() { setScenes(scenes.map((s) => ({ ...s, selected: true }))); }
  function selectTopRated(min: number) {
    setScenes(scenes.map((s) => ({ ...s, selected: (s.aiRating || 0) >= min })));
  }

  async function exportToMerge() {
    if (!sessionId) return;
    setPhase("exporting"); setErr("");
    try {
      // Persist current selection
      await fetch(`/api/video/trim/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ scenes: scenes.map((s) => ({ id: s.id, selected: s.selected })) }),
      });
      const res = await fetch(`/api/video/trim/sessions/${sessionId}/export`, { method: "POST", headers: adminHeaders() });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "export failed");
      router.push(`/video/jobs/${j.jobId}`);
    } catch (e: any) {
      setErr(e?.message || "שגיאה"); setPhase("ready");
    }
  }

  const selectedCount = scenes.filter((s) => s.selected).length;

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      {phase === "idle" && (
        <Section step={1} title="העלאת סרטון">
          {/* Detection engine picker */}
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDetectMode("ai")}
              className={`text-right p-3 rounded-lg border transition ${
                detectMode === "ai" ? "border-purple-500 bg-purple-500/10" : "border-slate-700 bg-slate-950/40 hover:border-slate-600"
              }`}
            >
              <div className="text-sm font-bold text-white flex items-center gap-2">
                🤖 ניתוח AI (Gemini Video Understanding)
                <span className="text-[9px] uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded">מומלץ</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Gemini מנתח את הוידאו עצמו ומחזיר סצנות + תיאור + דירוג בקריאה אחת. מדויק יותר. ~$0.005 לסרטון.</div>
            </button>
            <button
              type="button"
              onClick={() => setDetectMode("local")}
              className={`text-right p-3 rounded-lg border transition ${
                detectMode === "local" ? "border-cyan-500 bg-cyan-500/10" : "border-slate-700 bg-slate-950/40 hover:border-slate-600"
              }`}
            >
              <div className="text-sm font-bold text-white">🧩 זיהוי מקומי (FFmpeg WASM)</div>
              <div className="text-xs text-slate-400 mt-1">פועל בדפדפן, חינם, מתבסס על שינויי פיקסלים בלבד. דירוג ע״י Gemini בנפרד.</div>
            </button>
          </div>

          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-500 file:text-slate-950 hover:file:bg-cyan-400 file:cursor-pointer"
          />
        </Section>
      )}

      {/* AI detection progress */}
      {aiDetectJobId && (
        <SyncProgress
          jobId={aiDetectJobId}
          steps={["מעלה את הוידאו ל-Gemini Files API", "Gemini מנתח את הוידאו (סצנות + דירוג)", "שומר סצנות", "הושלם"]}
          onComplete={async (result) => {
            setAiDetectJobId(null);
            if (result?.sessionId) {
              setSessionId(result.sessionId);
              const r = await fetch(`/api/video/trim/sessions/${result.sessionId}`);
              if (r.ok) {
                const s = await r.json();
                setScenes(s.scenes);
                setTotalDur(s.durationSec);
              }
              setPhase("ready");
              setProgressPct(100);
            }
          }}
          onFailed={(e) => { setAiDetectJobId(null); setErr(e); setPhase("idle"); }}
        />
      )}

      {/* Progress for upload + detection */}
      {(phase === "uploading" || phase === "detecting") && (
        <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-5">
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-gradient-to-l from-cyan-500 to-purple-500 transition-all" style={{ width: `${Math.max(3, progressPct)}%` }} />
          </div>
          <div className="text-xs text-slate-300 text-center">{progressPct}% · {progressMsg}</div>
        </div>
      )}

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-3 text-sm">⚠ {err}</div>}

      {/* Step 2-4: Scenes review */}
      {scenes.length > 0 && (phase === "ready" || phase === "rating" || phase === "exporting") && (
        <>
          <Section step={2} title={`סצנות שזוהו (${scenes.length}) · נבחרו ${selectedCount}`}>
            <div className="flex gap-2 flex-wrap mb-4">
              <button onClick={runRating} disabled={phase !== "ready"} className="text-xs bg-purple-500 hover:bg-purple-400 text-white font-semibold px-3 py-2 rounded disabled:opacity-50">
                🤖 דרג את כולן עם Gemini
              </button>
              <button onClick={selectAll} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded border border-slate-700">בחר הכל</button>
              <button onClick={() => selectTopRated(7)} disabled={!scenes.some((s) => s.aiRating)} className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-2 rounded disabled:opacity-50">השאר רק 7+ ⭐</button>
              <button onClick={() => selectTopRated(5)} disabled={!scenes.some((s) => s.aiRating)} className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-2 rounded disabled:opacity-50">השאר רק 5+ ⭐</button>
            </div>

            {ratingJobId && (
              <SyncProgress
                jobId={ratingJobId}
                steps={["Gemini מדרג סצנות", "הושלם"]}
                onComplete={async () => { setRatingJobId(null); await reloadSession(); setPhase("ready"); }}
                onFailed={(e) => { setRatingJobId(null); setErr(e); setPhase("ready"); }}
              />
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {scenes.map((s, i) => (
                <SceneCard key={s.id || i} scene={s} index={i} onToggle={() => toggleScene(i)} />
              ))}
            </div>
          </Section>

          <Section step={3} title="ייצא לפרויקט מיזוג">
            <button
              onClick={exportToMerge}
              disabled={phase === "exporting" || selectedCount === 0}
              className="bg-gradient-to-l from-purple-500 to-cyan-500 hover:opacity-90 text-white font-bold px-6 py-3 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {phase === "exporting" ? "🔄 מייצא…" : `🚀 צור פרויקט מיזוג עם ${selectedCount} סצנות`}
            </button>
          </Section>
        </>
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

function SceneCard({ scene, index, onToggle }: { scene: any; index: number; onToggle: () => void }) {
  const dur = (scene.endSec - scene.startSec).toFixed(1);
  const rating = scene.aiRating;
  return (
    <button
      onClick={onToggle}
      className={`text-right rounded-lg overflow-hidden border-2 transition ${
        scene.selected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-800 opacity-50"
      }`}
    >
      <div className="relative bg-black aspect-video">
        {scene.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🎬</div>
        )}
        <span className="absolute top-1 right-1 bg-slate-950/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
          #{index + 1}
        </span>
        <span className="absolute bottom-1 right-1 bg-slate-950/80 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
          {dur}s
        </span>
        {scene.selected && (
          <span className="absolute top-1 left-1 bg-emerald-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded">
            ✓
          </span>
        )}
      </div>
      <div className="p-2 bg-slate-950/60">
        {rating != null ? (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-amber-300 text-sm">{"★".repeat(Math.round(rating / 2))}</span>
            <span className="text-[11px] text-slate-400 font-mono">{rating}/10</span>
          </div>
        ) : (
          <div className="text-[10px] text-slate-600 mb-1">(לא דורג)</div>
        )}
        {scene.aiReason && <div className="text-[10px] text-slate-400 line-clamp-2">{scene.aiReason}</div>}
      </div>
    </button>
  );
}
