"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";
import SceneActivityLog from "@/components/scene-activity-log";
import SceneLogButton from "@/components/scene-log-button";

type Frame = { id: string; orderIndex: number; beatSummary: string | null; imagePrompt: string | null; status: string; generatedImageUrl: string | null; approvedImageUrl: string | null; cost?: number; model?: string; lastChargedAt?: string | null };
type Comment = { id: string; body: string; resolved: boolean; createdAt: string; user: { id: string; fullName: string; email: string } };
type Critic = { id: string; contentType: string; score: number; feedback: string | null; createdAt: string };
type SceneChar = { id: string; name: string; roleType: string | null; media: { fileUrl: string }[] };
type SceneVideo = { id: string; fileUrl: string; createdAt: string; metadata?: { model?: string; durationSeconds?: number; costUsd?: number; provider?: string; isPrimary?: boolean; kind?: string; sourceAssetId?: string } };
const VIDEO_MODEL_PRETTY: Record<string, string> = {
  seedance: "⚡ SeeDance 2",
  kling: "🎬 Kling 2.1",
  "veo3-fast": "🟪 VEO 3 Fast",
  "veo3-pro": "💎 VEO 3 Pro",
};
type DirectorSheet = { style: string; scene: string; character: string; shots: string; camera: string; effects: string; audio: string; technical: string; generatedAt: string };
type Scene = { id: string; sceneNumber: number; title: string | null; summary: string | null; scriptText: string | null; status: string; actualCost: number; episodeId: string | null; memoryContext?: { characters?: string[]; directorSheet?: DirectorSheet; directorNotes?: string; soundNotes?: string; bridgeFrameUrl?: string; seedImageUrl?: string } | null; frames: Frame[]; criticReviews: Critic[]; comments: Comment[]; sceneCharacters?: SceneChar[]; videos?: SceneVideo[]; scriptMentionsNotInCast?: string[] };

export default function ScenePage() {
  const { id } = useParams<{ id: string }>();
  const lang = useLang();
  const he = lang === "he";
  const [scene, setScene] = useState<Scene | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiCosts, setAiCosts] = useState<{ total: number; count: number; byTool: Record<string, { total: number; count: number; latest: string | null }> } | null>(null);

  async function loadCosts() {
    setAiCosts(await api<{ total: number; count: number; byTool: Record<string, { total: number; count: number; latest: string | null }> }>(`/api/v1/scenes/${id}/ai-costs`).catch(() => null));
  }

  async function load() {
    const s = await api<Scene>(`/api/v1/scenes/${id}`);
    setScene(s);
    setComments(await api<Comment[]>(`/api/v1/scenes/${id}/comments`).catch(() => []));
    loadCosts();
  }
  useEffect(() => { load(); }, [id]);

  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      const list = (scene?.frames ?? []).filter((f) => f.approvedImageUrl || f.generatedImageUrl);
      if (list.length === 0) return;
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const delta = e.key === "ArrowRight" ? (he ? -1 : 1) : (he ? 1 : -1);
        setLightbox({ index: (lightbox.index + delta + list.length) % list.length });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, scene, he]);
  const [imageModel, setImageModel] = useState<"nano-banana">("nano-banana");
  // Remix modal state
  const [remixModal, setRemixModal] = useState<{ assetId: string; model: string } | null>(null);
  const [remixSuggestion, setRemixSuggestion] = useState<string | null>(null);
  const [remixNotes, setRemixNotes] = useState("");
  const [remixBusy, setRemixBusy] = useState<"suggest" | "submit" | null>(null);

  type AllVideoModel =
    | "sora-2" | "higgs-kling" | "higgs-seedance" | "higgsfield";
  const [videoModel, setVideoModel] = useState<AllVideoModel>("sora-2");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [veoModalOpen, setVeoModalOpen] = useState(false);
  const [veoJob, setVeoJob] = useState<{ startedAt: number; durationGoal: number; elapsed: number; videoCountBefore: number; done: boolean; maxWaitMs?: number; label?: string; initialStatus?: string; progress?: number } | null>(null);
  const [veoModel, setVeoModel] = useState<AllVideoModel>("sora-2");
  const [veoDuration, setVeoDuration] = useState(20);
  const [veoAspect, setVeoAspect] = useState<"16:9" | "9:16">("16:9");
  const RATES: Record<AllVideoModel, number> = {
    "sora-2": 0.10, "higgs-kling": 0.274, "higgs-seedance": 0.047, higgsfield: 0.005,
  };
  const MAX_DURATION: Record<AllVideoModel, number> = {
    "sora-2": 20, "higgs-kling": 15, "higgs-seedance": 12, higgsfield: 12,
  };
  const MODEL_LABEL: Record<AllVideoModel, { emoji: string; name: string; price: string; audio: boolean; note?: string }> = {
    "sora-2":         { emoji: "🟢", name: "Sora 2",            price: "~$2/20s",  audio: true,  note: "ברירת מחדל" },
    "higgs-kling":    { emoji: "🎬", name: "Kling 3.0",         price: "~$4/15s",  audio: true,  note: "via Higgsfield" },
    "higgs-seedance": { emoji: "⚡", name: "Seedance 1.5",      price: "~$0.56/12s", audio: true, note: "via Higgsfield" },
    higgsfield:       { emoji: "🎞", name: "Soul Standard",     price: "~$0.06",   audio: true,  note: "via Higgsfield" },
  };
  const maxDurForModel = MAX_DURATION[veoModel];
  const veoRate = RATES[veoModel];
  const veoEstimate = veoRate * veoDuration;

  async function genStoryboard() {
    // Client-side guard: if the scene lists characters, all must have gallery images
    const missing = (scene?.sceneCharacters ?? []).filter((c) => c.media.length === 0);
    if (missing.length > 0) {
      alert((he ? "לא ניתן לייצר תשריט — לדמויות הבאות אין תמונות בגלריה: " : "Cannot generate — these characters have no gallery images: ") + missing.map((c) => c.name).join(", "));
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ framesGenerated: number; framesTotal: number; estimate: { estimate: number }; model: string }>(`/api/v1/scenes/${id}/generate-storyboard`, {
        method: "POST", body: { imageModel, aspectRatio: aspect },
      });
      alert((he ? `נוצרו ${r.framesGenerated}/${r.framesTotal} מסגרות עם ${r.model}. עלות משוערת: $${r.estimate.estimate.toFixed(2)}` : `Generated ${r.framesGenerated}/${r.framesTotal} frames with ${r.model}. Est cost: $${r.estimate.estimate.toFixed(2)}`));
      setTimeout(load, 1500);
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function genVideo() {
    setVeoModalOpen(true);
  }

  async function runVeo() {
    setVeoModalOpen(false);
    const beforeCount = scene?.videos?.length ?? 0;
    setVeoJob({ startedAt: Date.now(), durationGoal: 90, elapsed: 0, videoCountBefore: beforeCount, done: false, initialStatus: scene?.status });
    try {
      await api(`/api/v1/scenes/${id}/generate-video`, {
        method: "POST",
        body: { videoModel: veoModel, aspectRatio: veoAspect, durationSeconds: veoDuration },
      });
    } catch (e: unknown) {
      alert((e as Error).message);
      setVeoJob(null);
    }
  }

  // Tick the job progress + poll scene for new videos.
  // On success OR on 4-minute timeout, trigger a full page data refresh so
  // status, frames, videos AND the AI cost card all update — not just the
  // videos array.
  useEffect(() => {
    if (!veoJob || veoJob.done) return;
    const MAX_WAIT_MS = veoJob.maxWaitMs ?? 180_000; // 4min default; remix overrides to 3min
    const tick = setInterval(() => {
      setVeoJob((j) => {
        if (!j) return null;
        const elapsed = Math.round((Date.now() - j.startedAt) / 1000);
        return { ...j, elapsed };
      });
    }, 1000);
    const poll = setInterval(async () => {
      try {
        const fresh = await api<{ videos?: { id: string; fileUrl: string }[]; status?: string; videoProgress?: number | null }>(`/api/v1/scenes/${id}`);
        const gotNewVideo = (fresh.videos?.length ?? 0) > veoJob.videoCountBefore;
        const statusChanged = !!fresh.status && !!veoJob.initialStatus && fresh.status !== veoJob.initialStatus;
        const serverSideSettled = statusChanged && ["VIDEO_REVIEW", "STORYBOARD_REVIEW", "STORYBOARD_APPROVED"].includes(fresh.status as string);
        const elapsed = Date.now() - veoJob.startedAt;
        // Update real progress from API (Sora returns 0-100%)
        if (typeof fresh.videoProgress === "number") {
          setVeoJob((j) => j ? { ...j, progress: fresh.videoProgress ?? undefined } : null);
        }
        if (gotNewVideo || serverSideSettled || elapsed > MAX_WAIT_MS) {
          setVeoJob((j) => j ? { ...j, done: true, elapsed: Math.round(elapsed / 1000), progress: 100 } : null);
          clearInterval(tick); clearInterval(poll);
          setTimeout(() => { window.location.reload(); }, 1200);
        } else {
          setScene((prev) => prev ? { ...prev, videos: fresh.videos ?? prev.videos } : prev);
        }
      } catch { /* ignore transient poll errors */ }
    }, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [veoJob?.startedAt, veoJob?.done, id]);

  const [approveStep, setApproveStep] = useState<null | "saving" | "bridge" | "done">(null);
  async function approve() {
    setBusy(true);
    setApproveStep("saving");
    try {
      const res = await api<{ bridgeFrameUrl?: string; bridgeCostUsd?: number }>(`/api/v1/scenes/${id}/approve`, { method: "POST" });
      setApproveStep("bridge");
      await new Promise((r) => setTimeout(r, 400));
      setApproveStep("done");
      const bridgeMsg = res?.bridgeFrameUrl
        ? `\n🖼 פריים אחרון נשמר לסצנה הבאה${res.bridgeCostUsd ? ` · עלות $${res.bridgeCostUsd.toFixed(4)}` : ""}`
        : "";
      alert((he ? "✅ הסצנה אושרה ונעולה לעריכה" : "Scene approved and locked") + bridgeMsg);
      // Hard refresh so the locked state + new bridge-frame card + disabled
      // buttons all render from a fresh server response. Oren asked for this.
      location.reload();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
      setApproveStep(null);
    }
  }

  async function unapprove() {
    if (!confirm(he ? "לבטל את אישור הסצנה? הפריים האחרון יישאר שמור." : "Unapprove scene? The last-frame bridge will be kept.")) return;
    setBusy(true);
    try {
      await api(`/api/v1/scenes/${id}/approve`, { method: "DELETE" });
      location.reload();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  async function critic() {
    setBusy(true);
    try {
      const r = await api<{ score: number; feedback: string }>(`/api/v1/scenes/${id}/critic/review`, { method: "POST" });
      alert((he ? `ציון: ${(r.score * 100).toFixed(0)}%\n` : `Score: ${(r.score * 100).toFixed(0)}%\n`) + (r.feedback ?? ""));
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetProgress, setSheetProgress] = useState<{ elapsed: number; step: number; label: string; done?: boolean; error?: string } | null>(null);

  async function buildSheet() {
    setSheetBusy(true);
    const steps = he
      ? ["קורא תסריט + דמויות", "טוען קאש סדרה", "שולח לבמאי AI", "בונה 8 סעיפים", "שומר"]
      : ["Reading script + cast", "Loading series cache", "Calling AI director", "Building 8 sections", "Saving"];
    const durations = [1, 2, 10, 6, 1];
    setSheetProgress({ elapsed: 0, step: 0, label: steps[0] });
    const started = Date.now();
    const tick = setInterval(() => {
      const sec = Math.round((Date.now() - started) / 1000);
      let acc = 0; let idx = 0;
      for (let i = 0; i < durations.length; i++) { acc += durations[i]; if (sec < acc) { idx = i; break; } idx = durations.length - 1; }
      setSheetProgress((p) => p && !p.done ? { ...p, elapsed: sec, step: idx, label: steps[idx] } : p);
    }, 1000);
    try {
      await api(`/api/v1/scenes/${id}/director-sheet`, { method: "POST" });
      clearInterval(tick);
      setSheetProgress({ elapsed: Math.round((Date.now() - started) / 1000), step: steps.length - 1, label: steps[steps.length - 1], done: true });
      load();
      setTimeout(() => setSheetProgress(null), 2000);
    } catch (e) {
      clearInterval(tick);
      setSheetProgress((p) => p ? { ...p, done: true, error: (e as Error).message, elapsed: Math.round((Date.now() - started) / 1000) } : null);
    } finally {
      setSheetBusy(false);
    }
  }

  async function breakdown() {
    setBusy(true);
    try {
      const r = await api<{ characters?: string[]; locations?: string[]; props?: string[]; tone?: string }>(`/api/v1/scenes/${id}/breakdown`, { method: "POST" });
      const lines: string[] = [];
      if (r.characters?.length) lines.push((he ? "דמויות: " : "Characters: ") + r.characters.join(", "));
      if (r.locations?.length) lines.push((he ? "מיקומים: " : "Locations: ") + r.locations.join(", "));
      if (r.props?.length) lines.push((he ? "אביזרים: " : "Props: ") + r.props.join(", "));
      if (r.tone) lines.push((he ? "טון: " : "Tone: ") + r.tone);
      alert((he ? "📋 פירוק התסריט:\n\n" : "📋 Script breakdown:\n\n") + (lines.join("\n") || (he ? "(אין תוצאות)" : "(no results)")));
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await api(`/api/v1/scenes/${id}/comments`, { method: "POST", body: { body: newComment } });
    setNewComment("");
    setComments(await api<Comment[]>(`/api/v1/scenes/${id}/comments`));
  }

  async function saveScript(text: string) {
    await api(`/api/v1/scenes/${id}`, { method: "PATCH", body: { scriptText: text } });
  }
  async function saveDirectorNotes(text: string) {
    const current = (scene?.memoryContext as object | null) ?? {};
    const merged = { ...current, directorNotes: text };
    await api(`/api/v1/scenes/${id}`, { method: "PATCH", body: { memoryContext: merged } });
    load();
  }
  async function saveSoundNotes(text: string) {
    const current = (scene?.memoryContext as object | null) ?? {};
    const merged = { ...current, soundNotes: text };
    await api(`/api/v1/scenes/${id}`, { method: "PATCH", body: { memoryContext: merged } });
    load();
  }
  const [soundBusy, setSoundBusy] = useState(false);
  async function generateSoundNotes() {
    setSoundBusy(true);
    try {
      await api(`/api/v1/scenes/${id}/sound-notes`, { method: "POST" });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setSoundBusy(false); }
  }
  async function saveField(field: "title" | "summary", value: string) {
    await api(`/api/v1/scenes/${id}`, { method: "PATCH", body: { [field]: value } });
    load();
  }
  const [editTitle, setEditTitle] = useState(false);
  const [editSummary, setEditSummary] = useState(false);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);

  async function regenFrame(frameId: string) {
    setRegenBusy(frameId);
    try {
      await api(`/api/v1/frames/${frameId}/regenerate`, { method: "POST" });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setRegenBusy(null); }
  }

  async function regenAll() {
    if (!confirm(he ? "לייצר מחדש את כל המסגרות בסצנה? השימוש בתמונות הדמויות מהגלריה לעקביות. עלות: $0.039 לכל מסגרת" : "Regenerate all frames in this scene using gallery refs? $0.039 per frame.")) return;
    setRegenBusy("all");
    try {
      for (const f of scene?.frames ?? []) {
        try { await api(`/api/v1/frames/${f.id}/regenerate`, { method: "POST" }); }
        catch (e) { console.warn("frame", f.id, e); }
      }
      load();
    } finally { setRegenBusy(null); }
  }

  if (!scene) return <div className="text-text-muted">{he ? "טוען…" : "Loading…"}</div>;

  return (
    <div translate="no" className="notranslate space-y-4">
      {scene.episodeId && (
        <Link href={`/episodes/${scene.episodeId}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          {he ? "→ חזרה לפרק" : "← Back to episode"}
        </Link>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div data-no-translate className="text-xs text-text-muted font-mono">SC{String(scene.sceneNumber).padStart(2, "0")}</div>
            {editTitle && scene.status !== "APPROVED" ? (
              <input autoFocus defaultValue={scene.title ?? ""}
                onBlur={(e) => { setEditTitle(false); saveField("title", e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditTitle(false); }}
                className="text-2xl font-bold bg-bg-main rounded-lg px-2 py-1 w-full" />
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className={`text-2xl font-bold group ${scene.status === "APPROVED" ? "" : "cursor-text"}`} onClick={scene.status === "APPROVED" ? undefined : () => setEditTitle(true)} title={scene.status === "APPROVED" ? (he ? "הסצנה אושרה — לבטל אישור כדי לערוך" : "Scene approved — unapprove to edit") : (he ? "לחץ לעריכה" : "Click to edit")}>
                  {scene.title ?? (he ? "סצנה ללא שם" : "Untitled scene")}
                  {scene.status !== "APPROVED" && <span className="opacity-0 group-hover:opacity-50 text-base ms-2">✎</span>}
                  {scene.status === "APPROVED" && <span className="text-base ms-2">🔒</span>}
                </h1>
                <SceneLogButton sceneId={scene.id} preloaded={scene.activityLogs} />
              </div>
            )}
            {editSummary && scene.status !== "APPROVED" ? (
              <textarea autoFocus defaultValue={scene.summary ?? ""} rows={2}
                onBlur={(e) => { setEditSummary(false); saveField("summary", e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Escape") setEditSummary(false); }}
                placeholder={he ? "תיאור הסצנה" : "Scene summary"}
                className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm mt-1" />
            ) : (
              <div className="mt-1 group">
                {scene.summary ? (
                  <p className={`text-text-secondary text-sm inline ${scene.status === "APPROVED" ? "" : "cursor-text"}`} onClick={scene.status === "APPROVED" ? undefined : () => setEditSummary(true)}>{scene.summary}{scene.status !== "APPROVED" && <span className="opacity-0 group-hover:opacity-50 text-xs ms-2">✎</span>}</p>
                ) : scene.status !== "APPROVED" ? (
                  <button onClick={() => setEditSummary(true)} className="text-xs text-text-muted hover:text-accent">+ {he ? "הוסף תיאור" : "Add summary"}</button>
                ) : null}
              </div>
            )}
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-bg-main font-bold whitespace-nowrap">{scene.status}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {(() => {
            const isApproved = scene.status === "APPROVED";
            const lockedTitle = he ? "הסצנה אושרה — לחץ \"ביטול אישור\" כדי לשנות" : "Scene approved — click \"Unapprove\" to edit";
            const locked = isApproved || busy;
            return (
              <>
                <button disabled={locked} title={isApproved ? lockedTitle : undefined} onClick={genStoryboard} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90">{he ? "צור תשריט" : "Generate storyboard"}</button>
                <button disabled={locked} title={isApproved ? lockedTitle : undefined} onClick={genVideo} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90">{he ? "צור וידאו" : "Generate video"}</button>
                <button disabled={locked} title={isApproved ? lockedTitle : undefined} onClick={breakdown} className="px-3 py-1.5 rounded-lg border-2 border-accent text-accent bg-white text-sm font-semibold hover:bg-accent hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{he ? "פירוק תסריט" : "Script breakdown"}</button>
                <button disabled={locked} title={isApproved ? lockedTitle : undefined} onClick={critic} className="px-3 py-1.5 rounded-lg border-2 border-accent text-accent bg-white text-sm font-semibold hover:bg-accent hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{he ? "מבקר AI" : "AI critic"}</button>
              </>
            );
          })()}
          {scene.status === "APPROVED" ? (
            <button disabled={busy} onClick={unapprove} className="px-3 py-1.5 rounded-lg border-2 border-status-errText text-status-errText bg-white text-sm font-semibold hover:bg-status-errText hover:text-white transition-colors disabled:opacity-50">
              {he ? "ביטול אישור" : "Unapprove"}
            </button>
          ) : (
            <button disabled={busy} onClick={approve} className="px-3 py-1.5 rounded-lg border-2 border-status-okText text-status-okText bg-white text-sm font-semibold hover:bg-status-okText hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2">
              {approveStep === "saving" && <span className="inline-block w-3 h-3 border-2 border-status-okText border-t-transparent rounded-full animate-spin" />}
              {approveStep === "saving" ? (he ? "שומר…" : "Saving…")
                : approveStep === "bridge" ? (he ? "שומר פריים אחרון…" : "Saving last frame…")
                : approveStep === "done" ? (he ? "✓ אושר" : "✓ Done")
                : (he ? "אשר סצנה" : "Approve")}
            </button>
          )}
        </div>

        {aiCosts && aiCosts.count > 0 && (() => {
          const TOOL_LABEL: Record<string, string> = he
            ? { storyboard: "🖼 תשריט", video: "🎬 וידאו", "director-sheet": "🎬 דף במאי", "sound-notes": "🔊 הערות סאונד", critic: "🧐 מבקר AI", breakdown: "📋 פירוק תסריט", dialogue: "💬 דיאלוג", seo: "🔍 SEO", subtitles: "📝 כתוביות", dubbing: "🗣 דיבוב", lipsync: "👄 Lip-sync", "text-ai": "✍ טקסט AI", other: "אחר" }
            : { storyboard: "🖼 Storyboard", video: "🎬 Video", "director-sheet": "🎬 Director Sheet", "sound-notes": "🔊 Sound notes", critic: "🧐 AI critic", breakdown: "📋 Breakdown", dialogue: "💬 Dialogue", seo: "🔍 SEO", subtitles: "📝 Subtitles", dubbing: "🗣 Dubbing", lipsync: "👄 Lip-sync", "text-ai": "✍ Text AI", other: "Other" };
          const entries = Object.entries(aiCosts.byTool).sort((a, b) => b[1].total - a[1].total);
          return (
            <div className="rounded-card border border-bg-main bg-bg-card px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">💰 {he ? "עלות AI של הסצנה" : "Scene AI cost"}</div>
                <div className="text-lg font-bold num text-accent">${aiCosts.total.toFixed(4)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {entries.map(([tool, v]) => (
                  <span key={tool} className="text-[11px] bg-bg-main rounded-full px-2 py-1">
                    <span className="text-text-secondary">{TOOL_LABEL[tool] ?? tool}</span>
                    <span className="num font-semibold ms-1">${v.total.toFixed(4)}</span>
                    <span className="text-text-muted ms-1">· {v.count}x</span>
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-text-muted mt-2">
                {he ? "מתעדכן אוטומטית אחרי כל ייצור · מצטבר גם בלשונית כספי הסדרה" : "Refreshes after each run · also aggregated in Project Finance"}
              </div>
            </div>
          );
        })()}

        {veoJob && (
          <Card title={veoJob.label ?? (he ? "🎬 מייצר וידאו" : "🎬 Generating video")} subtitle={veoJob.done ? (he ? "הושלם" : "Done") : (he ? `המערכת מעבדת · מקסימום ${Math.round((veoJob.maxWaitMs ?? 180_000) / 60_000)} דקות` : `Processing · max ${Math.round((veoJob.maxWaitMs ?? 180_000) / 60_000)}min`)}>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <div>
                  <div className="font-semibold">{MODEL_LABEL[veoModel].emoji} {MODEL_LABEL[veoModel].name}</div>
                  <div className="text-xs text-text-muted">{veoDuration}s · {veoAspect} · <span className="num">${veoEstimate.toFixed(2)}</span></div>
                </div>
                <div className="text-end">
                  {typeof veoJob.progress === "number" ? (
                    <>
                      <div className="text-xs text-text-muted">{he ? "התקדמות" : "Progress"}</div>
                      <div className="text-2xl font-bold num text-accent">{veoJob.progress}%</div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-text-muted">{he ? "זמן שעבר" : "Elapsed"}</div>
                      <div className="text-2xl font-bold num">{veoJob.elapsed}s</div>
                    </>
                  )}
                </div>
              </div>
              <div className="h-2 rounded-full bg-bg-main overflow-hidden">
                <div className={`h-full transition-all duration-500 ${veoJob.done ? "bg-status-okText" : "bg-accent"}`} style={{ width: `${typeof veoJob.progress === "number" ? veoJob.progress : Math.min(100, (veoJob.elapsed / veoJob.durationGoal) * 100)}%` }} />
              </div>
              {veoJob.done ? (
                <div className="flex items-center justify-between text-sm text-status-okText">
                  <span>✅ {he ? "הוידאו מוכן — גלול למטה לצפייה" : "Video ready — scroll down"}</span>
                  <button onClick={() => setVeoJob(null)} className="text-xs text-text-muted hover:text-text-primary">{he ? "סגור" : "Dismiss"}</button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{he ? "אפשר להמשיך לעבוד. העמוד יתרענן אוטומטית כשהוידאו יהיה מוכן." : "You can keep working. Page auto-refreshes when ready."}</span>
                  <button onClick={() => setVeoJob(null)} className="hover:text-text-primary">{he ? "הסתר" : "Hide"}</button>
                </div>
              )}
            </div>
          </Card>
        )}

        {((scene.sceneCharacters?.length ?? 0) > 0 || (scene.scriptMentionsNotInCast?.length ?? 0) > 0) && (
          <Card title={he ? "דמויות בסצנה" : "Characters in this scene"} subtitle={he ? "מי שמופיעים (משמש גם לעקביות חזותית בייצור)" : "Who appears (used for visual consistency)"}>
            <div className="flex gap-3 flex-wrap">
              {(scene.sceneCharacters ?? []).map((c) => {
                const missing = c.media.length === 0;
                return (
                  <div key={c.id} className={`flex items-center gap-2 rounded-full pe-3 ps-0.5 py-0.5 ${missing ? "bg-status-errBg" : "bg-bg-main"}`}>
                    {c.media[0] ? (
                      <img src={c.media[0].fileUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-bg-card flex items-center justify-center text-xs">🎭</div>
                    )}
                    <div className="text-sm">
                      <div className="font-medium">{c.name}</div>
                      {missing && <div className="text-[10px] text-status-errText">{he ? "חסרה גלריה" : "needs gallery"}</div>}
                      {!missing && c.roleType && <div className="text-[10px] text-text-muted">{c.roleType}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            {(scene.scriptMentionsNotInCast?.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-bg-main">
                <div className="text-[10px] uppercase tracking-widest text-status-warnText mb-2">
                  ⚠ {he ? "שמות שמוזכרים בתסריט אבל לא קיימים כדמויות:" : "Names mentioned in script but not in cast:"}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {scene.scriptMentionsNotInCast!.map((n) => (
                    <span key={n} className="text-xs px-2 py-1 rounded-full bg-status-warningBg text-status-warnText font-mono uppercase">{n}</span>
                  ))}
                </div>
                <div className="text-[11px] text-text-muted mt-2">{he ? "צור אותם בעמוד דמויות (🎭) כדי שהם יופיעו בעקביות בווידאו." : "Create them on the Characters page so the video is consistent."}</div>
              </div>
            )}
          </Card>
        )}

        <Card title={he ? "תסריט" : "Script"}>
          <textarea defaultValue={scene.scriptText ?? ""} onBlur={(e) => saveScript(e.target.value)} rows={10} className="w-full px-3 py-2 rounded-lg border border-bg-main font-mono text-sm" placeholder={he ? "מספר: פעם אחת..." : "NARRATOR: Once upon a time…"} />
        </Card>

        <Card title={he ? "דף הבמאי · Director Sheet" : "Director Sheet"} subtitle={he ? "8 סעיפים שמוזנים לפרומפט של ייצור הוידאו" : "8 sections fed into the video generation prompt"}>
          <div className="flex justify-end mb-3">
            <button disabled={sheetBusy || scene.status === "APPROVED"} title={scene.status === "APPROVED" ? (he ? "הסצנה אושרה — לבטל אישור כדי לשנות" : "Scene approved — unapprove to edit") : undefined} onClick={buildSheet} className="text-xs px-3 py-1 rounded-lg border-2 border-accent text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
              {sheetBusy ? (he ? "מייצר…" : "Generating…") : scene.memoryContext?.directorSheet ? (he ? "🔁 ייצר מחדש" : "🔁 Regenerate") : (he ? "✨ ייצר עם AI" : "✨ Generate with AI")}
            </button>
          </div>
          {sheetProgress && (
            <div className={`mb-3 rounded-lg p-3 border ${sheetProgress.error ? "bg-status-errBg border-status-errText" : sheetProgress.done ? "bg-status-okBg border-status-okText" : "bg-bg-main border-accent"}`}>
              {sheetProgress.error ? (
                <div className="text-sm text-status-errText">⚠ {sheetProgress.error}</div>
              ) : (
                <>
                  <div className="flex justify-between text-xs">
                    <span>{sheetProgress.done ? (he ? "✅ דף הבמאי מוכן" : "✅ Sheet ready") : sheetProgress.label}</span>
                    <span className="num text-text-muted">{sheetProgress.elapsed}s</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-card mt-2 overflow-hidden">
                    <div className={`h-full transition-all ${sheetProgress.done ? "bg-status-okText" : "bg-accent"}`} style={{ width: `${sheetProgress.done ? 100 : Math.min(99, ((sheetProgress.step + 1) / 5) * 100)}%` }} />
                  </div>
                </>
              )}
            </div>
          )}
          {scene.memoryContext?.directorSheet ? (() => {
            const s = scene.memoryContext!.directorSheet!;
            const rows = [
              { k: "style",     label: he ? "סגנון" : "Style",     v: s.style },
              { k: "scene",     label: he ? "סצנה" : "Scene",     v: s.scene },
              { k: "character", label: he ? "דמויות" : "Character", v: s.character },
              { k: "camera",    label: he ? "מצלמה" : "Camera",     v: s.camera },
              { k: "shots",     label: he ? "שוטים" : "Shots",     v: s.shots },
              { k: "effects",   label: he ? "אפקטים" : "Effects",   v: s.effects },
              { k: "audio",     label: he ? "סאונד" : "Audio",     v: s.audio },
              { k: "technical", label: he ? "טכני" : "Technical",  v: s.technical },
            ];
            return (
              <div className="space-y-2 text-sm">
                {rows.map((r) => (
                  <div key={r.k} className="bg-bg-main rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-widest text-accent font-bold mb-1">[{r.label}]</div>
                    <div className="text-text-secondary whitespace-pre-wrap">{r.v || "—"}</div>
                  </div>
                ))}
                <div className="text-[10px] text-text-muted">{he ? "נוצר: " : "Generated: "}{new Date(s.generatedAt).toLocaleString()}</div>
              </div>
            );
          })() : (
            <div className="text-center py-8 text-text-muted">
              <div className="text-3xl mb-2">🎬</div>
              <div className="text-sm">{he ? "אין עדיין דף במאי. לחץ \"ייצר עם AI\"." : "No Director Sheet yet. Click Generate."}</div>
            </div>
          )}
        </Card>

        <Card title={he ? "📝 הערות במאי (ידני)" : "📝 Director notes (manual)"} subtitle={he ? "הערות שיתווספו לפרומפט של הוידאו — מעל הדף האוטומטי" : "Notes appended to the video prompt — above the auto sheet"}>
          <textarea
            defaultValue={scene.memoryContext?.directorNotes ?? ""}
            onBlur={(e) => saveDirectorNotes(e.target.value)}
            readOnly={scene.status === "APPROVED"}
            rows={3}
            placeholder={he ? "כל הנחייה מקצועית נוספת: צבעוניות, תאורה, קצב, דברים שחשובים לך שיעברו לווידאו" : "Any additional professional note: colour, lighting, pacing, beats you want the video to honor"}
            className={`w-full px-3 py-2 rounded-lg border border-bg-main text-sm ${scene.status === "APPROVED" ? "opacity-70 bg-bg-main/60" : ""}`}
          />
          <div className="text-[11px] text-text-muted mt-1">
            {scene.status === "APPROVED"
              ? (he ? "🔒 נעול — הסצנה מאושרת. לחץ \"ביטול אישור\" כדי לערוך." : "🔒 Locked — scene is approved. Click Unapprove to edit.")
              : (he ? "יציאה שומרת" : "Blur saves")}
          </div>
        </Card>

        {scene.videos && scene.videos.length > 0 && (
          <Card title={he ? "סרטוני הסצנה" : "Scene videos"} subtitle={`${scene.videos.length} ${he ? "סרטונים" : "videos"} · ${he ? "סה\"כ" : "total"}: $${scene.videos.reduce((s, v) => s + (v.metadata?.costUsd ?? 0), 0).toFixed(3)}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {scene.videos.map((v) => {
                const m = v.metadata ?? {};
                const isPrimary = !!m.isPrimary;
                const modelPretty = m.model ? (VIDEO_MODEL_PRETTY[m.model] ?? m.model) : "—";
                return (
                  <div key={v.id} className={`rounded-lg overflow-hidden ${isPrimary ? "bg-status-okBg border-2 border-status-okText" : "bg-bg-main"}`}>
                    <video src={v.fileUrl} controls className="w-full aspect-video bg-black" />
                    <div className="p-3 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold flex items-center gap-2 flex-wrap">
                          {modelPretty}
                          {(m.kind === "remix" || m.sourceAssetId) && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-warnText text-white font-semibold">✨ {he ? "רימיקס" : "Remix"}</span>
                          )}
                          {isPrimary && <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-okText text-white font-semibold">⭐ {he ? "ראשי" : "Main"}</span>}
                        </span>
                        {m.costUsd !== undefined && <span className="font-bold num text-accent">${m.costUsd.toFixed(4)}</span>}
                      </div>
                      <div className="flex justify-between text-[11px] text-text-muted">
                        <span>{m.durationSeconds ? `${m.durationSeconds}s` : ""}</span>
                        <span>{new Date(v.createdAt).toLocaleString()}</span>
                      </div>
                      <div data-no-translate className="grid grid-cols-4 gap-1 mt-2">
                        {!isPrimary ? (
                          <button onClick={async () => {
                            try {
                              await api(`/api/v1/scenes/${scene.id}/set-active-video`, { method: "POST", body: { assetId: v.id } });
                              location.reload();
                            } catch (e) { alert((e as Error).message); }
                          }} className="text-[11px] py-1.5 rounded-lg bg-accent text-white font-semibold text-center">⭐ ראשי</button>
                        ) : <div />}
                        {(m.provider === "openai" || /sora/i.test(m.model ?? "")) ? (
                          <button onClick={() => setRemixModal({ assetId: v.id, model: m.model ?? "sora-2" })}
                            className="text-[11px] py-1.5 rounded-lg border-2 border-status-warnText text-status-warnText font-semibold text-center">✨ Remix</button>
                        ) : <div />}
                        <button onClick={async () => {
                          try {
                            const res = await fetch(v.fileUrl);
                            const blob = await res.blob();
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = `scene-${scene.sceneNumber}-${v.id.slice(-6)}.mp4`;
                            a.click();
                            URL.revokeObjectURL(a.href);
                          } catch { window.open(v.fileUrl, "_blank"); }
                        }} className="text-[11px] py-1.5 rounded-lg border border-bg-main text-text-primary font-semibold text-center hover:bg-bg-main">⬇ הורד</button>
                        <button onClick={() => {
                          const url = `${window.location.origin}${v.fileUrl}`;
                          navigator.clipboard.writeText(url).then(() => {
                            const btn = document.activeElement as HTMLButtonElement;
                            const orig = btn?.textContent ?? "";
                            if (btn) { btn.textContent = "✓ הועתק"; setTimeout(() => { btn.textContent = orig; }, 1500); }
                          });
                        }} className="text-[11px] py-1.5 rounded-lg border border-bg-main text-text-primary font-semibold text-center hover:bg-bg-main">🔗 קישור</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {(() => {
          const bridgeUrl = scene.memoryContext?.bridgeFrameUrl;
          const seedUrl = scene.memoryContext?.seedImageUrl;
          const framesCost = scene.frames.reduce((s, f) => s + (f.cost ?? 0), 0);
          const bridgeCost = bridgeUrl ? 0.002 : 0;
          const totalCost = framesCost + bridgeCost;
          const parts: string[] = [];
          if (scene.frames.length > 0) parts.push(`${scene.frames.length} ${he ? "מסגרות" : "frames"}`);
          if (bridgeUrl) parts.push(he ? "🖼 פריים אחרון" : "🖼 bridge frame");
          if (seedUrl) parts.push(he ? "🌱 seed" : "🌱 seed");
          const countStr = parts.length > 0 ? parts.join(" · ") : (he ? "אין עדיין" : "none yet");
          return (
        <Card title={he ? "מסגרות תשריט" : "Storyboard frames"} subtitle={`${countStr} · ${he ? "סה\"כ" : "total"}: $${totalCost.toFixed(4)}`}>
          {/* Bridge frame (last-frame of approved video → i2v seed for scene N+1) */}
          {bridgeUrl && (
            <div className="mb-4 rounded-lg border-2 border-status-okText bg-status-okBg/40 p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div>
                  <div className="font-semibold text-sm">🖼 {he ? "פריים אחרון (גשר לסצנה הבאה)" : "Bridge frame (to next scene)"}</div>
                  <div className="text-[11px] text-text-muted">{he ? "נוצר אוטומטית באישור הסצנה · ישמש כ-i2v seed של הסצנה הבאה" : "Auto-generated on approval · becomes the next scene's i2v seed"}</div>
                </div>
                <span className="text-xs font-bold num text-accent">${bridgeCost.toFixed(4)}</span>
              </div>
              <img src={bridgeUrl} alt="bridge frame" className="rounded-lg border border-bg-main w-full max-w-2xl aspect-video object-cover bg-black" />
              <a href={bridgeUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs text-accent hover:underline">
                {he ? "פתח בטאב חדש ↗" : "Open in new tab ↗"}
              </a>
            </div>
          )}
          {/* Seed from previous scene (used when generating video for THIS scene) */}
          {seedUrl && (
            <div className="mb-4 rounded-lg border border-bg-main p-3">
              <div className="font-semibold text-sm mb-1">🌱 {he ? "Seed מהסצנה הקודמת" : "Seed from previous scene"}</div>
              <div className="text-[11px] text-text-muted mb-2">{he ? "הפריים האחרון של הסצנה הקודמת — יועבר כ-reference ל-Sora/Kling בלחיצה על \"צור וידאו\"" : "Previous scene's last frame — passed to Sora/Kling as reference when you click Generate video"}</div>
              <img src={seedUrl} alt="seed" className="rounded-lg border border-bg-main w-full max-w-2xl aspect-video object-cover bg-black" />
            </div>
          )}
          {scene.frames.length > 0 && (
            <div className="flex justify-end mb-3">
              <button disabled={regenBusy === "all" || scene.status === "APPROVED"} title={scene.status === "APPROVED" ? (he ? "הסצנה אושרה — לבטל אישור כדי לשנות" : "Scene approved — unapprove to edit") : undefined} onClick={regenAll} className="text-xs px-3 py-1 rounded-lg border-2 border-accent text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {regenBusy === "all" ? (he ? "מייצר מחדש…" : "Regenerating…") : (he ? "🔁 ייצר מחדש את כולם עם הדמויות" : "🔁 Regenerate all using gallery")}
              </button>
            </div>
          )}
          {scene.frames.length === 0 && !bridgeUrl && !seedUrl ? (
            <div className="text-text-muted text-sm space-y-1">
              <div>{he ? "אין מסגרות עדיין." : "No frames yet."}</div>
              <div>{he ? "✨ \"צור תשריט\" יוצר מסגרות מלאות לסצנה · ✅ \"אשר סצנה\" יוצר אוטומטית את הפריים האחרון (bridge frame) לסצנה הבאה." : "✨ 'Generate storyboard' creates full scene frames · ✅ 'Approve scene' auto-creates the bridge frame for the next scene."}</div>
            </div>
          ) : scene.frames.length === 0 ? null : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(() => { const withImages = scene.frames.filter((ff) => ff.approvedImageUrl || ff.generatedImageUrl); return null; })()}
              {scene.frames.map((f) => {
                const url = f.approvedImageUrl || f.generatedImageUrl;
                const visibleIndex = scene.frames.filter((ff) => ff.approvedImageUrl || ff.generatedImageUrl).findIndex((ff) => ff.id === f.id);
                return (
                  <div key={f.id} className="bg-bg-main rounded-lg p-3 text-xs">
                    {url ? (
                      <button onClick={() => setLightbox({ index: visibleIndex })} className="block w-full aspect-video bg-bg-card rounded mb-2 overflow-hidden group">
                        <img src={url} alt={f.beatSummary ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </button>
                    ) : (
                      <div className="aspect-video bg-bg-card rounded mb-2 grid place-items-center text-text-muted">
                        <div className="text-center">
                          <div className="text-2xl mb-1">—</div>
                          <div className="text-[10px]">{he ? "ממתין לתמונה" : "pending image"}</div>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <div className="font-semibold">{he ? `מסגרת ${f.orderIndex + 1}` : `Frame ${f.orderIndex + 1}`}</div>
                      <button
                        disabled={regenBusy === f.id || scene.status === "APPROVED"}
                        onClick={(e) => { e.stopPropagation(); regenFrame(f.id); }}
                        title={scene.status === "APPROVED" ? (he ? "הסצנה אושרה — לבטל אישור כדי לשנות" : "Scene approved — unapprove to edit") : (he ? "ייצר מחדש עם תמונות הדמויות" : "Regenerate using character refs")}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-accent text-accent disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {regenBusy === f.id ? "…" : "🔁"}
                      </button>
                    </div>
                    <div className="text-text-secondary line-clamp-2">{f.beatSummary ?? "—"}</div>
                    <div className="text-[10px] text-text-muted mt-1 space-y-0.5">
                      <div className="flex justify-between items-center gap-2">
                        <span>{f.status}</span>
                        {f.cost && f.cost > 0 ? (
                          <span className="num text-text-secondary">
                            {f.model ? `${f.model} · ` : ""}<span className="font-bold">${f.cost.toFixed(4)}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted/60">{he ? "טרם נוצר" : "not generated"}</span>
                        )}
                      </div>
                      {f.lastChargedAt && (
                        <div className="text-text-muted/70 num text-[10px]" title={new Date(f.lastChargedAt).toISOString()}>
                          {he ? "נוצר: " : "created: "}{new Date(f.lastChargedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
          );
        })()}
      </div>

      <div className="space-y-6">
        <Card title={he ? "מבקר AI" : "AI Critic"} subtitle={`${scene.criticReviews.length} ${he ? "ביקורות" : "reviews"}`}>
          {scene.criticReviews.length === 0 ? (
            <div className="text-text-muted text-sm">{he ? "אין ביקורות עדיין." : "No reviews yet."}</div>
          ) : (
            <ul className="space-y-3">
              {scene.criticReviews.map((r) => {
                const typeMap: Record<string, string> = { NARRATIVE: "עלילה", CONTINUITY: "רצף", THUMBNAIL: "תמונת מפתח", DIALOGUE: "דיאלוג", VISUAL: "ויזואלי" };
                return (
                  <li key={r.id} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold" data-no-translate>{he ? (typeMap[r.contentType] ?? r.contentType) : r.contentType}</span>
                      <span className="num font-bold" style={{ color: r.score > 0.7 ? "#1db868" : r.score > 0.4 ? "#f0a500" : "#e03a4e" }}>{(r.score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-text-secondary text-xs" data-no-translate>{r.feedback ?? "—"}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={he ? "🔊 הערות סאונד" : "🔊 Sound notes"} subtitle={he ? "מוזיקה · אפקטים · דיבוב. ה-AI מצרף את זה ל-[Audio] של הוידאו" : "Music · SFX · dubbing — fed into the [Audio] section of the prompt"}>
          <div className="flex justify-end mb-2">
            <button disabled={soundBusy || scene.status === "APPROVED"} title={scene.status === "APPROVED" ? (he ? "הסצנה אושרה — לבטל אישור כדי לשנות" : "Scene approved — unapprove to edit") : undefined} onClick={generateSoundNotes} className="text-xs px-3 py-1 rounded-lg border-2 border-accent text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
              {soundBusy ? (he ? "מייצר…" : "Generating…") : scene.memoryContext?.soundNotes ? (he ? "🔁 ייצר מחדש עם AI" : "🔁 Regenerate with AI") : (he ? "✨ ייצר עם AI" : "✨ Generate with AI")}
            </button>
          </div>
          <textarea
            key={scene.memoryContext?.soundNotes ?? "empty"}
            defaultValue={scene.memoryContext?.soundNotes ?? ""}
            onBlur={(e) => saveSoundNotes(e.target.value)}
            readOnly={scene.status === "APPROVED"}
            rows={Math.max(6, Math.min(40, (scene.memoryContext?.soundNotes ?? "").split("\n").length + 2))}
            placeholder={he ? "למשל: מוזיקה מתמתחת ברקע · תקתוקי שעון · נשימות כבדות של הדמות · קול טלפון מצלצל לעצירה חדה" : "e.g. tense music builds under · clock ticking · heavy breathing · phone ring, sharp cut"}
            className={`w-full px-3 py-2 rounded-lg border border-bg-main text-sm whitespace-pre-wrap ${scene.status === "APPROVED" ? "opacity-70 bg-bg-main/60" : ""}`}
            style={{ resize: "vertical", minHeight: 120 }}
          />
          <div className="text-[11px] text-text-muted mt-2">{he ? "יציאה שומרת · שינויים נשמרים לצמיתות ללמידה עתידית" : "Blur saves · history preserved for future learning"}</div>
        </Card>

      </div>
      </div>

      {veoModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setVeoModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-card bg-bg-card border border-bg-main p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">🎬 {he ? "ייצור וידאו" : "Video generation"}</h3>
              <button onClick={() => setVeoModalOpen(false)} className="text-text-muted">✕</button>
            </div>

            <div>
              <div className="text-xs text-text-muted mb-1.5">{he ? "מודל" : "Model"}</div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MODEL_LABEL) as AllVideoModel[]).map((k) => {
                  const ml = MODEL_LABEL[k];
                  const active = veoModel === k;
                  return (
                    <button key={k} onClick={() => { setVeoModel(k); if (veoDuration > MAX_DURATION[k]) setVeoDuration(MAX_DURATION[k]); }} className={`px-3 py-2 rounded-lg text-start transition border-2 ${active ? "bg-accent/10 border-accent" : "bg-bg-main border-bg-main hover:border-accent/50"}`}>
                      <div className="text-sm font-semibold flex items-center gap-1">
                        <span>{ml.emoji} {ml.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${ml.audio ? "bg-status-okBg text-status-okText" : "bg-status-warningBg text-status-warnText"}`} title={ml.audio ? (he ? "כולל סאונד" : "with audio") : (he ? "ללא סאונד" : "silent")}>
                          {ml.audio ? "🔊" : "🔇"}
                        </span>
                      </div>
                      <div className="text-[10px] text-text-muted">{ml.price} · up to {MAX_DURATION[k]}s</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs text-text-muted mb-1.5">{he ? "משך (שניות)" : "Duration (seconds)"}: <span className="font-bold text-accent">{veoDuration}</span> <span className="text-text-muted">/ {maxDurForModel} {he ? "מקסימום" : "max"}</span></div>
              <input type="range" min={1} max={maxDurForModel} value={veoDuration} onChange={(e) => setVeoDuration(Number(e.target.value))} className="w-full accent-accent" />
            </div>

            <div>
              <div className="text-xs text-text-muted mb-1.5">{he ? "יחס" : "Aspect ratio"}</div>
              <div className="grid grid-cols-2 gap-2 bg-bg-main p-1 rounded-xl">
                <button onClick={() => setVeoAspect("9:16")} className={`py-2 rounded-lg text-sm font-semibold transition ${veoAspect === "9:16" ? "bg-accent text-white" : "bg-transparent text-text-secondary hover:text-text-primary"}`}>📱 9:16</button>
                <button onClick={() => setVeoAspect("16:9")} className={`py-2 rounded-lg text-sm font-semibold transition ${veoAspect === "16:9" ? "bg-accent text-white" : "bg-transparent text-text-secondary hover:text-text-primary"}`}>🖥 16:9</button>
              </div>
            </div>

            {!MODEL_LABEL[veoModel].audio && scene.scriptText && /\b[A-Z]{2,}:|\b[A-Z]{2,}\s*\(/.test(scene.scriptText) && (
              <div className="bg-status-warningBg border border-status-warnText/40 text-status-warnText rounded-lg p-3 text-xs">
                ⚠ {he ? "המודל הזה יוצר וידאו ללא סאונד. בסצנה יש דיאלוג — בחר VEO 3 (Fast/Pro) כדי שהדיבור והסאונד ייווצרו אוטומטית." : "This model creates silent video. The scene has dialogue — pick VEO 3 (Fast/Pro) to get speech + audio natively."}
              </div>
            )}

            <div className="bg-accent/5 border border-accent/30 rounded-xl p-4 text-center">
              <div className="text-xs text-text-muted">{he ? "עלות משוערת" : "Estimated cost"}</div>
              <div className="text-3xl font-bold text-accent num">${veoEstimate.toFixed(2)}</div>
              <div className="text-[10px] text-text-muted mt-1">{veoDuration}s × ${veoRate.toFixed(3)}/sec</div>
            </div>

            <button onClick={runVeo} className="w-full py-3 rounded-xl bg-accent text-white font-bold text-sm hover:opacity-90 transition">
              🎬 {he ? `הפעל ${MODEL_LABEL[veoModel].name}` : `Run ${MODEL_LABEL[veoModel].name}`}
            </button>
            <button onClick={() => setVeoModalOpen(false)} className="w-full text-center text-text-muted text-sm hover:text-text-secondary">{he ? "ביטול" : "Cancel"}</button>
          </div>
        </div>
      )}

      {/* ── Remix Modal ── */}
      {remixModal && scene && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => { setRemixModal(null); setRemixSuggestion(null); setRemixNotes(""); }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-bg-card rounded-card border border-bg-main p-5 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">✨ Remix</h3>
              <button onClick={() => { setRemixModal(null); setRemixSuggestion(null); setRemixNotes(""); }} className="text-text-muted">✕</button>
            </div>

            {/* Step 1: Ask AI Director for suggestions */}
            {!remixSuggestion && (
              <div className="space-y-3">
                <p className="text-sm text-text-secondary">{he ? "הבמאי AI יסקור את הסצנה ויציע הערות שיפור. אם אין מה לשנות — הוא יגיד." : "The AI Director will review the scene and suggest improvements. If nothing needs fixing, it'll say so."}</p>
                <button
                  disabled={remixBusy === "suggest"}
                  onClick={async () => {
                    setRemixBusy("suggest");
                    try {
                      const r = await api<{ suggestion: string }>(`/api/v1/scenes/${scene.id}/remix-suggest`, { method: "POST" });
                      setRemixSuggestion(r.suggestion);
                      setRemixNotes(r.suggestion);
                    } catch (e) { alert((e as Error).message); }
                    finally { setRemixBusy(null); }
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold disabled:opacity-50"
                >
                  {remixBusy === "suggest" ? (he ? "🎬 הבמאי סוקר…" : "🎬 Director reviewing…") : (he ? "🎬 בקש מהבמאי לסקור" : "🎬 Ask Director to review")}
                </button>
              </div>
            )}

            {/* Step 2: Show suggestions + editable notes */}
            {remixSuggestion && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider">{he ? "הערות הבמאי (ערוך לפי הצורך)" : "Director's notes (edit as needed)"}</div>
                <textarea
                  value={remixNotes}
                  onChange={(e) => setRemixNotes(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm font-mono"
                />
                <div className="flex gap-2">
                  <button
                    disabled={remixBusy === "submit" || !remixNotes.trim()}
                    onClick={async () => {
                      setRemixBusy("submit");
                      const beforeCount = scene?.videos?.length ?? 0;
                      try {
                        await api(`/api/v1/scenes/${scene.id}/remix-video`, {
                          method: "POST",
                          body: { assetId: remixModal.assetId, prompt: remixNotes.trim() },
                        });
                        // Kick off the same progress panel the generate-video flow uses
                        // (polls every 5s, auto-reloads on new video OR after maxWaitMs)
                        // — remix uses a tighter 3-minute ceiling per Oren's request.
                        setVeoJob({
                          startedAt: Date.now(),
                          durationGoal: 120,
                          elapsed: 0,
                          videoCountBefore: beforeCount,
                          done: false,
                          maxWaitMs: 180_000,
                          label: he ? "✨ Remix מתבצע…" : "✨ Remix in progress…",
                          initialStatus: scene?.status,
                        });
                        setRemixModal(null); setRemixSuggestion(null); setRemixNotes("");
                      } catch (e) { alert((e as Error).message); }
                      finally { setRemixBusy(null); }
                    }}
                    className="flex-1 px-4 py-2 rounded-lg bg-accent text-white font-semibold disabled:opacity-50"
                  >
                    {remixBusy === "submit" ? "…" : (he ? "✨ שלח Remix" : "✨ Submit Remix")}
                  </button>
                  <button
                    onClick={() => { setRemixModal(null); setRemixSuggestion(null); setRemixNotes(""); }}
                    className="px-4 py-2 rounded-lg border border-bg-main text-sm"
                  >
                    {he ? "ביטול" : "Cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {lightbox && (() => {
        const list = (scene?.frames ?? []).filter((ff) => ff.approvedImageUrl || ff.generatedImageUrl);
        const f = list[lightbox.index];
        if (!f) return null;
        const url = f.approvedImageUrl || f.generatedImageUrl;
        const go = (delta: number) => setLightbox({ index: (lightbox.index + delta + list.length) % list.length });
        return (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50" onClick={() => setLightbox(null)}>
            <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center gap-2">
                {list.length > 1 && <button onClick={() => go(he ? 1 : -1)} className="bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full shrink-0 text-xl">‹</button>}
                <img src={url ?? ""} alt={f.beatSummary ?? ""} className="max-w-full max-h-[80vh] rounded-lg" />
                {list.length > 1 && <button onClick={() => go(he ? -1 : 1)} className="bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full shrink-0 text-xl">›</button>}
              </div>
              <button onClick={() => setLightbox(null)} className="absolute top-2 end-2 bg-black/70 text-white w-8 h-8 rounded-full">✕</button>
              <div className="mt-3 bg-black/70 text-white rounded-lg p-3 text-xs flex flex-wrap gap-x-6 gap-y-1 items-center">
                <div><span className="text-white/60">{he ? "מסגרת" : "Frame"}: </span><span className="font-semibold">{f.orderIndex + 1}</span></div>
                {f.model && <div><span className="text-white/60">{he ? "מודל" : "Model"}: </span><span className="font-semibold">{f.model}</span></div>}
                {f.lastChargedAt && <div><span className="text-white/60">{he ? "נוצר" : "Created"}: </span><span className="num">{new Date(f.lastChargedAt).toLocaleString()}</span></div>}
                {f.cost && f.cost > 0 ? <div><span className="text-white/60">{he ? "עלות" : "Cost"}: </span><span className="num font-semibold">${f.cost.toFixed(4)}</span></div> : null}
                {f.beatSummary && <div className="basis-full text-white/80">{f.beatSummary}</div>}
                <div className="ms-auto text-white/60 num">{lightbox.index + 1} / {list.length}</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function SoundAndLipSyncCard({ he, scene }: { he: boolean; scene: Scene }) {
  const script = scene.scriptText || "";
  const { dialogues, soundCues, actionLines } = parseScriptForAudio(script);
  const hasContent = dialogues.length > 0 || soundCues.length > 0 || actionLines.length > 0;
  const totalWords = dialogues.reduce((s, d) => s + d.line.split(/\s+/).length, 0);
  const approxDuration = Math.max(1, Math.round(totalWords / 2.5));

  return (
    <Card
      title={he ? "סאונד ו-Lip Sync" : "Sound & Lip Sync"}
      subtitle={he
        ? `${dialogues.length} שורות דיאלוג · ${soundCues.length} הוראות סאונד`
        : `${dialogues.length} dialogue lines · ${soundCues.length} sound cues`}
    >
      {!hasContent ? (
        <div className="text-text-muted text-sm">
          {he ? "אין דיאלוג או הוראות סאונד בתסריט עדיין." : "No dialogue or sound cues in the script yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {dialogues.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  {he ? "🎙️ דיאלוג ללי-פסינג" : "🎙️ Dialogue for lip-sync"}
                </div>
                <div className="text-[11px] text-text-muted">
                  {he ? `~${approxDuration} שנ׳` : `~${approxDuration}s`} · {totalWords} {he ? "מילים" : "words"}
                </div>
              </div>
              <ul className="space-y-2">
                {dialogues.map((d, i) => (
                  <li key={i} className="bg-status-ok/5 border border-status-ok/20 rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase bg-status-ok/20 text-status-okText px-2 py-0.5 rounded">
                        {d.character}
                      </span>
                      {d.direction && (
                        <span className="text-[10px] italic text-text-muted">({d.direction})</span>
                      )}
                    </div>
                    <div className="text-sm text-text-primary leading-relaxed">{d.line}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {soundCues.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
                {he ? "🔊 הוראות סאונד" : "🔊 Sound cues"}
              </div>
              <ul className="space-y-1.5">
                {soundCues.map((s, i) => (
                  <li key={i} className="text-sm text-text-primary bg-status-info/5 border border-status-info/20 rounded-lg p-2">
                    <span className="text-[10px] font-bold uppercase text-status-infoText mr-2">{s.type}</span>
                    {s.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {actionLines.length > 0 && (
            <details>
              <summary className="text-xs font-bold uppercase tracking-wider text-text-secondary cursor-pointer hover:text-text-primary">
                {he ? "📝 מלל הוראות בימוי" : "📝 Action/direction lines"} ({actionLines.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                {actionLines.map((a, i) => (
                  <li key={i} className="italic">• {a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

function parseScriptForAudio(script: string): {
  dialogues: Array<{ character: string; line: string; direction?: string }>;
  soundCues: Array<{ type: string; text: string }>;
  actionLines: string[];
} {
  const dialogues: Array<{ character: string; line: string; direction?: string }> = [];
  const soundCues: Array<{ type: string; text: string }> = [];
  const actionLines: string[] = [];
  if (!script.trim()) return { dialogues, soundCues, actionLines };

  const lines = script.split("\n");
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (!raw) { i++; continue; }

    const sfxMatch = raw.match(/^(SFX|SOUND|MUSIC|AUDIO|FX)\s*[:\-–]\s*(.+)/i);
    if (sfxMatch) {
      soundCues.push({ type: sfxMatch[1].toUpperCase(), text: sfxMatch[2].trim() });
      i++;
      continue;
    }

    const isCharacterCue =
      raw.length >= 2 &&
      raw.length <= 40 &&
      /^[A-Z0-9][A-Z0-9 .'_-]*$/.test(raw) &&
      !raw.startsWith("INT.") && !raw.startsWith("EXT.") && !raw.startsWith("FADE");

    if (isCharacterCue) {
      let direction: string | undefined;
      let next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      const maybeParen = lines[next]?.trim();
      if (maybeParen && /^\(.+\)$/.test(maybeParen)) {
        direction = maybeParen.slice(1, -1);
        next++;
        while (next < lines.length && !lines[next].trim()) next++;
      }
      const dialogueParts: string[] = [];
      while (next < lines.length) {
        const dl = lines[next].trim();
        if (!dl) break;
        if (/^(SFX|SOUND|MUSIC|INT\.|EXT\.)/i.test(dl)) break;
        if (/^[A-Z0-9][A-Z0-9 .'_-]*$/.test(dl) && dl.length <= 40 && !/[.!?]$/.test(dl)) break;
        dialogueParts.push(dl);
        next++;
      }
      if (dialogueParts.length > 0) {
        dialogues.push({ character: raw, line: dialogueParts.join(" "), direction });
        i = next;
        continue;
      }
    }

    if (raw.length > 2 && !raw.startsWith("(")) {
      actionLines.push(raw);
    }
    i++;
  }

  return { dialogues, soundCues, actionLines };
}
