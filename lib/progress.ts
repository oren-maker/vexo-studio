/**
 * Progress calculation per scene/episode/season.
 * 0%   — nothing
 * 20%  — script text written
 * 30%  — storyboard frames generated (placeholders)
 * 50%  — storyboard frames have actual images
 * 60%  — storyboard approved
 * 75%  — video generated (in review)
 * 100% — scene APPROVED or LOCKED
 */
type SceneInput = {
  status: string;
  scriptText?: string | null;
  frames: { imagePrompt?: string | null; generatedImageUrl?: string | null; approvedImageUrl?: string | null }[];
};

export function sceneProgress(s: SceneInput): number {
  if (s.status === "APPROVED" || s.status === "LOCKED") return 100;
  if (s.status === "VIDEO_REVIEW" || s.status === "VIDEO_GENERATING") return 75;
  if (s.status === "STORYBOARD_APPROVED") return 60;
  // Has frames with real images?
  const hasImages = s.frames.some((f) => !!(f.generatedImageUrl ?? f.approvedImageUrl));
  if (hasImages) return 50;
  // Has frames at all (storyboard generated)
  if (s.frames.length > 0) return 30;
  // Has script
  if (s.scriptText && s.scriptText.trim().length > 20) return 20;
  return 0;
}

export function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export function progressColor(pct: number): string {
  if (pct >= 100) return "#1db868";
  if (pct >= 60) return "#0091d4";
  if (pct >= 30) return "#f0a500";
  return "#9aaabf";
}

export function progressLabel(pct: number, lang: "he" | "en" = "en"): string {
  if (lang === "he") {
    if (pct >= 100) return "מאושר";
    if (pct >= 75) return "וידאו";
    if (pct >= 60) return "תשריט מאושר";
    if (pct >= 50) return "תמונות תשריט";
    if (pct >= 30) return "תשריט";
    if (pct >= 20) return "סקריפט";
    return "טיוטה";
  }
  if (pct >= 100) return "Approved";
  if (pct >= 75) return "Video";
  if (pct >= 60) return "Storyboard ✓";
  if (pct >= 50) return "Storyboard images";
  if (pct >= 30) return "Storyboard";
  if (pct >= 20) return "Script";
  return "Draft";
}
