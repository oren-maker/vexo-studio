"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Version = {
  id: string;
  versionNumber: number;
  scriptSnapshot: string | null;
  reviewNotes: string | null;
  createdAt: string;
  createdByUserId: string | null;
};
type Payload = {
  current: { scriptText: string | null; scriptSource: string | null; updatedAt: string };
  versions: Version[];
};

// Line-by-line diff with LCS-style alignment is overkill for a 400-line prompt.
// A simpler unified-like rendering: split both sides into lines, show unchanged
// lines once in the middle, deletions on the left, additions on the right.
// For scripts this is clear enough and zero-dependency.
function computeLineDiff(oldText: string, newText: string): { old: string[]; new: string[]; unchanged: Set<number> } {
  const o = oldText.split("\n");
  const n = newText.split("\n");
  const unchanged = new Set<number>();
  // Mark every line from "old" that also appears in "new" (by first occurrence).
  // Captures the stable sections of the prompt; differences surface as unmarked
  // lines that the UI highlights.
  const newSeen = new Map<string, number>();
  n.forEach((l, i) => { if (!newSeen.has(l)) newSeen.set(l, i); });
  o.forEach((l, i) => { if (newSeen.has(l)) unchanged.add(i); });
  return { old: o, new: n, unchanged };
}

export function SceneVersionsDiff({ sceneId, he = true }: { sceneId: string; he?: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [leftId, setLeftId] = useState<string>("current");   // "current" | version.id
  const [rightId, setRightId] = useState<string>(""); // version.id — older snapshot to compare against

  useEffect(() => {
    api<Payload>(`/api/v1/scenes/${sceneId}/versions`).then(setData).catch(() => setData(null));
  }, [sceneId]);

  if (!data) return <div className="text-xs text-text-muted">{he ? "טוען גרסאות…" : "Loading versions…"}</div>;
  if (data.versions.length === 0) {
    return <div className="text-xs text-text-muted py-4 text-center">{he ? "אין עדיין גרסאות שמורות לסצנה הזו" : "No saved versions for this scene yet"}</div>;
  }

  const leftText = leftId === "current"
    ? (data.current.scriptText ?? "")
    : (data.versions.find((v) => v.id === leftId)?.scriptSnapshot ?? "");
  const rightText = rightId
    ? (data.versions.find((v) => v.id === rightId)?.scriptSnapshot ?? "")
    : "";

  const showDiff = leftText && rightText;
  const diff = showDiff ? computeLineDiff(rightText, leftText) : null;

  function label(v: Version) {
    return `v${v.versionNumber} · ${new Date(v.createdAt).toLocaleString(he ? "he-IL" : "en-US", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <div className="text-[10px] text-text-muted uppercase mb-1">{he ? "שמאל (חדש יותר)" : "Left (newer)"}</div>
          <select value={leftId} onChange={(e) => setLeftId(e.target.value)} className="bg-bg-main border border-bg-main rounded px-2 py-1 text-sm">
            <option value="current">{he ? "נוכחי" : "Current"}</option>
            {data.versions.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
          </select>
        </div>
        <span className="text-text-muted pb-1">vs</span>
        <div>
          <div className="text-[10px] text-text-muted uppercase mb-1">{he ? "ימין (ישן)" : "Right (older)"}</div>
          <select value={rightId} onChange={(e) => setRightId(e.target.value)} className="bg-bg-main border border-bg-main rounded px-2 py-1 text-sm">
            <option value="">{he ? "— בחר גרסה —" : "— pick version —"}</option>
            {data.versions.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
          </select>
        </div>
      </div>

      {!showDiff ? (
        <div className="text-xs text-text-muted">{he ? "בחר גרסה מימין כדי להשוות" : "Pick a version to compare"}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs font-mono leading-snug">
          <div className="bg-bg-main rounded p-2 max-h-96 overflow-y-auto">
            <div className="text-[10px] uppercase mb-1 text-text-muted">{he ? "ישן" : "Old"}</div>
            {diff!.old.map((line, i) => (
              <div key={i} className={`${diff!.unchanged.has(i) ? "text-text-muted" : "text-red-300 bg-red-500/10"} whitespace-pre-wrap`}>{line || "\u00A0"}</div>
            ))}
          </div>
          <div className="bg-bg-main rounded p-2 max-h-96 overflow-y-auto">
            <div className="text-[10px] uppercase mb-1 text-text-muted">{he ? "חדש" : "New"}</div>
            {diff!.new.map((line, i) => {
              const stable = diff!.old.some((o, oi) => diff!.unchanged.has(oi) && o === line);
              return (
                <div key={i} className={`${stable ? "text-text-muted" : "text-emerald-300 bg-emerald-500/10"} whitespace-pre-wrap`}>{line || "\u00A0"}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
