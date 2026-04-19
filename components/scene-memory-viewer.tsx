"use client";
import { useState } from "react";

// Minimal inspector for Scene.memoryContext — surfaces what the brain
// "knows" about the scene beyond scriptText: characters, director sheet,
// sound notes, bridge frames, seed image, shotList flag. Collapsible so
// it doesn't crowd the page by default.

type Mem = {
  characters?: string[];
  directorSheet?: Record<string, string>;
  directorNotes?: string;
  soundNotes?: string;
  bridgeFrameUrl?: string;
  bridgeFrameUrls?: string[];
  seedImageUrl?: string;
  shotList?: unknown[];
  shotListGeneratedAt?: string;
} | null | undefined;

export function SceneMemoryViewer({ memory, he = true }: { memory: Mem; he?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!memory) return null;

  const items: { label: string; value: string | number; present: boolean }[] = [
    { label: he ? "דמויות" : "characters", value: memory.characters?.length ?? 0, present: (memory.characters?.length ?? 0) > 0 },
    { label: he ? "Director Sheet" : "director sheet", value: memory.directorSheet ? Object.keys(memory.directorSheet).length + " sections" : "—", present: !!memory.directorSheet },
    { label: he ? "הערות במאי" : "director notes", value: memory.directorNotes ? `${memory.directorNotes.length} chars` : "—", present: !!memory.directorNotes },
    { label: he ? "הערות סאונד" : "sound notes", value: memory.soundNotes ? `${memory.soundNotes.length} chars` : "—", present: !!memory.soundNotes },
    { label: he ? "bridge frames" : "bridge frames", value: memory.bridgeFrameUrls?.length ?? (memory.bridgeFrameUrl ? 1 : 0), present: !!(memory.bridgeFrameUrl || memory.bridgeFrameUrls?.length) },
    { label: he ? "seed image" : "seed image", value: memory.seedImageUrl ? "✓" : "—", present: !!memory.seedImageUrl },
    { label: he ? "shot list" : "shot list", value: Array.isArray(memory.shotList) ? `${memory.shotList.length} shots` : "—", present: Array.isArray(memory.shotList) && memory.shotList.length > 0 },
  ];
  const populated = items.filter((i) => i.present).length;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-slate-400 hover:text-cyan-300"
      >
        {open ? "▼" : "▶"} {he ? "מה הבמאי זוכר על הסצנה" : "What the brain remembers"} ({populated}/{items.length})
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          {items.map((it) => (
            <div key={it.label} className={`rounded p-2 border ${it.present ? "bg-emerald-500/5 border-emerald-500/30" : "bg-slate-900/50 border-slate-800"}`}>
              <div className="text-[9px] uppercase text-slate-500">{it.label}</div>
              <div className={`font-mono ${it.present ? "text-emerald-300" : "text-slate-500"}`}>{it.value}</div>
            </div>
          ))}
          {memory.shotListGeneratedAt && (
            <div className="col-span-full text-[10px] text-slate-500 font-mono">
              shot list: {new Date(memory.shotListGeneratedAt).toLocaleString("he-IL")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
