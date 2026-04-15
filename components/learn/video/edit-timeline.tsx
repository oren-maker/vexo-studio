"use client";

// Premiere-style horizontal timeline visualization for a merge project.
// Shows: video clips track, transitions track, audio track. Width is proportional to duration.

type Clip = {
  filename: string;
  durationSec?: number | null;
  trimStart?: number | null;
  trimEnd?: number | null;
  transition?: string | null;       // applied between this clip and the NEXT
  transitionDur?: number | null;
};

type Transition = {
  beforeClipIndex: number;          // index of clip BEFORE
  type: string;
  durationSec: number;
  status?: "pending" | "rendering" | "complete" | "failed";
};

export default function EditTimeline({
  clips,
  transitions = [],
  audioMode = "keep",
  audioTrackUrl = null,
  techSpecs,
}: {
  clips: Clip[];
  transitions?: Transition[];
  audioMode?: "keep" | "mute" | "track" | "narration";
  audioTrackUrl?: string | null;
  techSpecs?: { resolution: string; fps: number; codec: string; aspectRatio: string };
}) {
  // Compute effective duration of each clip after trim
  const effDur = (c: Clip): number => {
    const start = c.trimStart ?? 0;
    const end = c.trimEnd ?? c.durationSec ?? 5;
    return Math.max(0.5, end - start);
  };

  const clipDurations = clips.map(effDur);
  const transitionMap = new Map<number, Transition>();
  for (const t of transitions) transitionMap.set(t.beforeClipIndex, t);

  // Add transition durations into the total to lay out tracks correctly.
  // Note: in real merge, transitions OVERLAP. For visualization we render them as separate slots.
  const segments: Array<{ kind: "clip" | "transition"; dur: number; idx: number }> = [];
  for (let i = 0; i < clips.length; i++) {
    segments.push({ kind: "clip", dur: clipDurations[i], idx: i });
    if (i < clips.length - 1) {
      const t = transitionMap.get(i);
      const tDur = t?.durationSec || (clips[i].transition && clips[i].transition !== "cut" ? clips[i].transitionDur || 0.5 : 0);
      if (tDur > 0) segments.push({ kind: "transition", dur: tDur, idx: i });
    }
  }
  const totalDur = segments.reduce((s, x) => s + x.dur, 0) || 1;

  // Format mm:ss
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s - m * 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="bg-slate-950/80 border border-slate-700 rounded-xl p-4 space-y-3" dir="ltr">
      {/* Tech specs strip */}
      {techSpecs && (
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>📐 {techSpecs.resolution} · {techSpecs.fps}fps · {techSpecs.aspectRatio} · {techSpecs.codec}</span>
          <span>⏱ סה״כ {fmt(totalDur)} ({clips.length} clips{transitions.length ? `, ${transitions.length} AI transitions` : ""})</span>
        </div>
      )}

      {/* Time ruler */}
      <div className="relative h-5 border-b border-slate-700">
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <div key={p} className="absolute top-0 text-[9px] text-slate-500 font-mono" style={{ left: `${p * 100}%`, transform: "translateX(-50%)" }}>
            {fmt(totalDur * p)}
          </div>
        ))}
      </div>

      {/* Video track */}
      <div>
        <div className="text-[9px] uppercase text-cyan-400 mb-1 font-semibold">🎬 וידאו</div>
        <div className="relative flex h-14 bg-slate-900 rounded overflow-hidden">
          {segments.map((seg, i) => {
            const widthPct = (seg.dur / totalDur) * 100;
            if (seg.kind === "clip") {
              const c = clips[seg.idx];
              return (
                <div
                  key={`v-${i}`}
                  className="border-r border-slate-700 bg-gradient-to-b from-cyan-500/30 to-cyan-700/30 flex items-center justify-center text-[10px] text-cyan-100 px-2 overflow-hidden whitespace-nowrap"
                  style={{ width: `${widthPct}%`, minWidth: "40px" }}
                  title={`${c.filename} · ${effDur(c).toFixed(1)}s${c.trimStart != null ? ` · trim ${c.trimStart}-${c.trimEnd}` : ""}`}
                >
                  <span className="truncate">{seg.idx + 1}. {c.filename.replace(/\.[^.]+$/, "").slice(0, 20)}</span>
                </div>
              );
            } else {
              const t = transitionMap.get(seg.idx);
              const isAi = t?.type?.startsWith("luma") || t?.type?.startsWith("runway");
              return (
                <div
                  key={`v-${i}`}
                  className={`flex items-center justify-center text-[9px] font-bold ${
                    isAi ? "bg-gradient-to-r from-purple-500/40 to-pink-500/40 text-purple-100" : "bg-amber-500/30 text-amber-100"
                  }`}
                  style={{ width: `${widthPct}%`, minWidth: "20px" }}
                  title={`${isAi ? "🤖 AI" : ""} ${t?.type || clips[seg.idx].transition} · ${seg.dur.toFixed(1)}s · ${t?.status || "ready"}`}
                >
                  {isAi ? "🤖" : "✨"}
                </div>
              );
            }
          })}
        </div>
      </div>

      {/* Transitions track */}
      {(transitions.length > 0 || clips.some((c, i) => i < clips.length - 1 && c.transition && c.transition !== "cut")) && (
        <div>
          <div className="text-[9px] uppercase text-purple-400 mb-1 font-semibold">✨ מעברים</div>
          <div className="relative flex h-5 bg-slate-900/50 rounded overflow-hidden">
            {segments.map((seg, i) => {
              const widthPct = (seg.dur / totalDur) * 100;
              if (seg.kind === "clip") {
                return <div key={`t-${i}`} style={{ width: `${widthPct}%` }} className="bg-slate-900/30" />;
              }
              const t = transitionMap.get(seg.idx);
              const isAi = t?.type?.startsWith("luma") || t?.type?.startsWith("runway");
              const statusColor =
                t?.status === "complete"
                  ? "bg-emerald-500/60"
                  : t?.status === "failed"
                  ? "bg-red-500/60"
                  : t?.status === "rendering"
                  ? "bg-amber-500/60 animate-pulse"
                  : isAi
                  ? "bg-purple-500/40"
                  : "bg-amber-500/40";
              return (
                <div
                  key={`t-${i}`}
                  className={`${statusColor} flex items-center justify-center text-[9px] text-white`}
                  style={{ width: `${widthPct}%`, minWidth: "16px" }}
                >
                  {seg.dur.toFixed(1)}s
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Audio track */}
      <div>
        <div className="text-[9px] uppercase text-emerald-400 mb-1 font-semibold">🔊 אודיו</div>
        <div className={`h-6 rounded flex items-center justify-center text-[10px] ${
          audioMode === "mute" ? "bg-slate-800/60 text-slate-500" :
          audioMode === "track" ? "bg-emerald-500/20 text-emerald-200" :
          "bg-blue-500/15 text-blue-200"
        }`}>
          {audioMode === "mute" ? "🔇 מושתק" :
           audioMode === "narration" ? `🎙 קריינות AI (Gemini TTS)${audioTrackUrl ? " ✓" : " — חסר"}` :
           audioMode === "track" ? `🎵 פס קול חיצוני${audioTrackUrl ? "" : " (לא הועלה)"}` :
           "🎤 אודיו מקורי של הקליפים"}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[9px] text-slate-500 pt-1 border-t border-slate-800">
        <span><span className="inline-block w-3 h-3 bg-cyan-500/50 align-middle ml-1 rounded-sm" />clip</span>
        <span><span className="inline-block w-3 h-3 bg-amber-500/50 align-middle ml-1 rounded-sm" />fade/dissolve</span>
        <span><span className="inline-block w-3 h-3 bg-purple-500/50 align-middle ml-1 rounded-sm" />🤖 AI transition</span>
        <span><span className="inline-block w-3 h-3 bg-emerald-500/60 align-middle ml-1 rounded-sm" />הושלם</span>
        <span><span className="inline-block w-3 h-3 bg-red-500/60 align-middle ml-1 rounded-sm" />נכשל</span>
      </div>
    </div>
  );
}
