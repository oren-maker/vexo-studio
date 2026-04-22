"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { sceneProgress, avg, progressColor, progressLabel } from "@/lib/progress";
import { useLang } from "@/lib/i18n";
import { OpeningWizard } from "@/components/opening-wizard";

type Frame = { generatedImageUrl: string | null; approvedImageUrl: string | null };
type Scene = { id: string; sceneNumber: number; status: string; scriptText: string | null; frames: Frame[] };
type EpisodeChar = { character: { id: string; name: string; media: { fileUrl: string }[] } };
type Episode = { id: string; episodeNumber: number; title: string; synopsis: string | null; status: string; scenes: Scene[]; characters?: EpisodeChar[] };
type Season = { id: string; seasonNumber: number; title: string | null; description: string | null; series: { projectId: string; project: { id: string; name: string } } };
type CharMedia = { id: string; fileUrl: string; cost?: number; createdAt?: string; metadata?: { angle?: string; provider?: string } };
type ProjectCharacter = { id: string; name: string; roleType: string | null; gender: string | null; ageRange: string | null; appearance: string | null; media: CharMedia[] };

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-bg-main text-text-secondary",
  PLANNING: "bg-bg-main text-text-secondary",
  IN_PRODUCTION: "bg-status-warningBg text-status-warnText",
  REVIEW: "bg-status-warningBg text-status-warnText",
  READY_FOR_PUBLISH: "bg-accent/20 text-accent",
  PUBLISHED: "bg-status-okBg text-status-okText",
  ARCHIVED: "bg-bg-main text-text-muted",
};

export default function SeasonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useLang();
  const [season, setSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [creating, setCreating] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ overall: string; arc?: string; pacing?: string; strengths: string[]; concerns: string[]; suggestions: string[] } | null>(null);
  const [epFeedback, setEpFeedback] = useState<{ episodeId: string; data: { overall: string; strengths: string[]; concerns: string[]; suggestions: string[]; sceneNotes?: { sceneNumber: number; note: string }[] } } | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [costs, setCosts] = useState<Record<string, number>>({});
  // Tab is mirrored to ?tab= so each tab has a shareable URL and refresh
  // doesn't reset the view. Oren asked: "שלכל טאב יהיה קישור משלו".
  const searchParams = useSearchParams();
  const pathname = usePathname();
  type TabName = "episodes" | "characters" | "logs" | "opening";
  const rawTab = (searchParams?.get("tab") ?? "episodes") as TabName;
  const tab: TabName = (["episodes", "characters", "logs", "opening"] as const).includes(rawTab as TabName) ? rawTab : "episodes";
  const setTab = (t: TabName) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", t);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  type Opening = { id: string; status: string; videoUrl: string | null; videoUri: string | null; currentPrompt: string; duration: number; model: string; aspectRatio: string; isSeriesDefault: boolean; cost: number | null; includeCharacters: boolean; styleLabel: string | null; updatedAt: string; chunkIndex: number; chunkPrompts: string[] | null; chunkVideoIds: string[] | null; falRequestId: string | null; versions: { id: string; prompt: string; createdAt: string }[] };
  type OpeningCostBreakdown = { text: number; video: number; total: number; calls: number };
  type OpeningVideo = { id: string; fileUrl: string; at: string; model: string | null; durationSeconds: number | null; costUsd: number | null };
  const [opening, setOpening] = useState<Opening | null>(null);
  const [openingCosts, setOpeningCosts] = useState<OpeningCostBreakdown | null>(null);
  const [openingVideos, setOpeningVideos] = useState<OpeningVideo[]>([]);
  const [openingWizardOpen, setOpeningWizardOpen] = useState(false);
  const [openingEditing, setOpeningEditing] = useState(false);
  const [openingPromptDraft, setOpeningPromptDraft] = useState("");
  const [openingJob, setOpeningJob] = useState<{ startedAt: number; elapsed: number; done: boolean } | null>(null);
  const [playingVideo, setPlayingVideo] = useState<{ url: string; label: string } | null>(null);
  const [contextData, setContextData] = useState<{ cache: { summary: string; data: any; updatedAt: string; tokenCount: number } | null; logs: { id: string; createdAt: string; decisionReason: string | null; output: any }[] } | null>(null);
  const [activity, setActivity] = useState<{ id: string; at: string; kind: string; actor: string | null; title: string; detail?: string; entityType: string; entityId: string }[] | null>(null);
  const [ctxBusy, setCtxBusy] = useState(false);
  const [characters, setCharacters] = useState<ProjectCharacter[]>([]);
  const [charBusy, setCharBusy] = useState<"populate" | "gallery" | string | null>(null);

  async function load() {
    setErr(null);
    try {
      const s = await api<Season>(`/api/v1/seasons/${id}`);
      setSeason(s);
    } catch (e: unknown) { setErr((e as Error).message); }
    try {
      const eps = await api<Episode[]>(`/api/v1/seasons/${id}/episodes`);
      const hydrated: Episode[] = await Promise.all(eps.map(async (e) => {
        const detail = await api<{ scenes: Scene[]; characters?: EpisodeChar[] }>(`/api/v1/episodes/${e.id}`).catch(() => ({ scenes: [] as Scene[], characters: [] }));
        return { ...e, scenes: detail.scenes ?? [], characters: detail.characters ?? [] };
      }));
      setEpisodes(hydrated);
      const costPairs = await Promise.all(hydrated.map(async (e) => {
        const c = await api<{ total: number }>(`/api/v1/episodes/${e.id}/costs`).catch(() => ({ total: 0 }));
        return [e.id, c.total] as const;
      }));
      setCosts(Object.fromEntries(costPairs));
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!season) return;
    api<ProjectCharacter[]>(`/api/v1/projects/${season.series.project.id}/characters`).then(setCharacters).catch(() => setCharacters([]));
  }, [season?.series.project.id, tab]);

  useEffect(() => {
    if (!season || tab !== "opening") return;
    api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`).then((r) => {
      setOpening(r.opening);
      setOpeningCosts(r.costBreakdown);
      setOpeningVideos(r.videoHistory ?? []);
      // Trigger client-side polling when Sora/VEO is in-flight. Status can be
      // GENERATING, but can also legitimately be DRAFT if the user edited the
      // prompt mid-flight (which resets status) while a job is still running
      // on the provider — falRequestId being set tells us there's a real job.
      const op = r.opening;
      const inFlight = !!op && !!op.falRequestId && op.status !== "READY" && op.status !== "FAILED";
      if (inFlight && !openingJob) {
        // A job is already in flight when we open the tab. Anchor elapsed time
        // to the server's updatedAt (when status flipped to GENERATING) — not
        // "now" — so the timer reflects real elapsed time of the running job.
        const started = op.updatedAt ? new Date(op.updatedAt).getTime() : Date.now();
        setOpeningJob({ startedAt: started, elapsed: Math.round((Date.now() - started) / 1000), done: false });
      }
    }).catch(() => { setOpening(null); setOpeningCosts(null); setOpeningVideos([]); });
  }, [season?.id, tab]);

  // Live progress + auto-poll + auto-refresh for opening video generation.
  useEffect(() => {
    if (!openingJob || openingJob.done || !season) return;
    // Sora-2 can legitimately take 5-7 min for 20s videos, especially with
    // moderation re-checks. Give the client 10 min before auto-unsticking.
    const MAX_MS = 600_000;
    const tick = setInterval(() => {
      setOpeningJob((j) => j ? { ...j, elapsed: Math.round((Date.now() - j.startedAt) / 1000) } : null);
    }, 1000);
    const poll = setInterval(async () => {
      try {
        const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
        const ready = r.opening?.status === "READY" && !!r.opening?.videoUrl;
        const failed = r.opening?.status === "FAILED";
        const elapsed = Date.now() - openingJob.startedAt;
        if (failed) {
          setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
          setOpeningJob((j) => j ? { ...j, done: true, elapsed: Math.round(elapsed / 1000) } : null);
          clearInterval(tick); clearInterval(poll);
          return;
        }
        if (ready || elapsed > MAX_MS) {
          // If timed out without completing, unstick the server-side status so
          // the user isn't blocked — stuck GENERATING otherwise lingers forever.
          if (!ready && r.opening?.status === "GENERATING") {
            await api(`/api/v1/seasons/${season.id}/opening`, { method: "PATCH", body: { status: "DRAFT" } }).catch(() => {});
          }
          setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
          setOpeningJob((j) => j ? { ...j, done: true, elapsed: Math.round(elapsed / 1000) } : null);
          clearInterval(tick); clearInterval(poll);
          if (ready) setTimeout(() => window.location.reload(), 1200);
          else window.location.reload();
        } else {
          setOpening(r.opening);
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [openingJob?.startedAt, openingJob?.done, season?.id]);

  useEffect(() => {
    if (!season || tab !== "logs") return;
    api<typeof contextData>(`/api/v1/projects/${season.series.project.id}/context`).then(setContextData).catch(() => {});
    api<{ rows: NonNullable<typeof activity> }>(`/api/v1/projects/${season.series.project.id}/activity?limit=200`)
      .then((r) => setActivity(r.rows))
      .catch(() => setActivity([]));
  }, [season?.series.project.id, tab]);

  async function refreshContext() {
    if (!season) return;
    setCtxBusy(true);
    try {
      await api(`/api/v1/projects/${season.series.project.id}/context/refresh`, { method: "POST" });
      const r = await api<typeof contextData>(`/api/v1/projects/${season.series.project.id}/context`);
      setContextData(r);
    } catch (e) { alert((e as Error).message); }
    finally { setCtxBusy(false); }
  }

  type ProposedChar = { name: string; roleType?: string; gender?: string; ageRange?: string; appearance: string; personality?: string; wardrobeRules?: string; speechStyle?: string; appearsInEpisodes: number[]; alreadyExists?: boolean };
  const [preview, setPreview] = useState<ProposedChar[] | null>(null);

  async function autoPopulateChars() {
    if (!season) return;
    setCharBusy("populate");
    try {
      const r = await api<{ characters: ProposedChar[] }>(`/api/v1/projects/${season.series.project.id}/characters/auto-populate`, { method: "POST", body: {} });
      setPreview(r.characters);
    } catch (e) { alert((e as Error).message); }
    finally { setCharBusy(null); }
  }

  async function applyPreview() {
    if (!season || !preview) return;
    setCharBusy("populate");
    try {
      const r = await api<{ totalCharacters: number; newlyCreated: number; skipped: string[] }>(`/api/v1/projects/${season.series.project.id}/characters/auto-populate`, {
        method: "POST",
        body: { characters: preview },
      });
      alert((lang === "he" ? `נשמרו ${r.newlyCreated} דמויות חדשות. ${r.skipped.length} קיימות נשמרו.` : `Saved ${r.newlyCreated} new characters. ${r.skipped.length} existing preserved.`));
      setPreview(null);
      const updated = await api<ProjectCharacter[]>(`/api/v1/projects/${season.series.project.id}/characters`);
      setCharacters(updated);
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setCharBusy(null); }
  }

  async function generateAllGalleries() {
    if (!season) return;
    const missing = characters.filter((c) => c.media.length === 0).length;
    if (missing === 0) return alert(lang === "he" ? "לכל הדמויות כבר יש תמונות" : "All characters already have images");
    const est = (missing * 5 * 0.039).toFixed(2);
    if (!confirm(lang === "he" ? `לייצר 5 תמונות לכל ${missing} דמויות? עלות משוערת: $${est}` : `Generate 5 images for ${missing} characters? Est: $${est}`)) return;
    setCharBusy("gallery");
    try {
      let pending = missing;
      while (pending > 0) {
        const r = await api<{ totalGenerated: number; pending: number }>(`/api/v1/projects/${season.series.project.id}/characters/generate-all-galleries`, { method: "POST" });
        pending = r.pending;
        if (r.totalGenerated === 0 && r.pending === 0) break;
        const updated = await api<ProjectCharacter[]>(`/api/v1/projects/${season.series.project.id}/characters`);
        setCharacters(updated);
      }
    } catch (e) { alert((e as Error).message); }
    finally { setCharBusy(null); }
  }

  async function regenerateAllStoryboards() {
    if (!season) return;
    if (!confirm(lang === "he" ? "לייצר מחדש את כל התשריטים בסדרה לפי הדמויות הקיימות? סצנות ללא גלריית דמויות יידלגו. העלות תועמס על הארנק." : "Regenerate all storyboards in this series using existing characters? Scenes missing galleries are skipped. Cost will be charged to the wallet.")) return;
    setCharBusy("regen");
    try {
      let runningTotal = 0, runningFrames = 0, pending = Infinity;
      while (pending !== 0) {
        const r = await api<{ framesGenerated: number; totalCost: number; pending: number; scenesProcessed: number }>(
          `/api/v1/projects/${season.series.project.id}/regenerate-storyboards`,
          { method: "POST" },
        );
        runningFrames += r.framesGenerated;
        runningTotal += r.totalCost;
        pending = r.pending;
        if (r.framesGenerated === 0 && r.pending === 0) break;
      }
      alert((lang === "he" ? `יוצרו מחדש ${runningFrames} מסגרות. עלות: $${runningTotal.toFixed(3)}` : `Regenerated ${runningFrames} frames. Cost: $${runningTotal.toFixed(3)}`));
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setCharBusy(null); }
  }

  async function generateOneGallery(cid: string, mode: "one" | "rest" = "one") {
    setCharBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: {} });
      const updated = await api<ProjectCharacter[]>(`/api/v1/projects/${season!.series.project.id}/characters`);
      setCharacters(updated);
    } catch (e) { alert((e as Error).message); }
    finally { setCharBusy(null); }
  }

  async function regenerateCharacter(cid: string, name: string) {
    if (!confirm(lang === "he"
      ? `למחוק את הגיליון של ${name} וליצור חדש? (~$0.04)`
      : `Wipe ${name}'s sheet and generate a fresh one? (~$0.04)`)) return;
    setCharBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: { regenerate: true } });
      const updated = await api<ProjectCharacter[]>(`/api/v1/projects/${season!.series.project.id}/characters`);
      setCharacters(updated);
    } catch (e) { alert((e as Error).message); }
    finally { setCharBusy(null); }
  }

  const [lightbox, setLightbox] = useState<{ character: ProjectCharacter; index: number } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const g = lightbox.character.media;
        if (g.length < 2) return;
        const delta = e.key === "ArrowRight" ? (lang === "he" ? -1 : 1) : (lang === "he" ? 1 : -1);
        setLightbox({ character: lightbox.character, index: (lightbox.index + delta + g.length) % g.length });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, lang]);

  async function newEpisode(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    await api(`/api/v1/seasons/${id}/episodes`, { method: "POST", body: { episodeNumber: episodes.length + 1, title: (f.elements.namedItem("t") as HTMLInputElement).value } });
    setCreating(false); load();
  }

  const [genBusy, setGenBusy] = useState(false);
  const [genProgress, setGenProgress] = useState<{ step: number; total: number; label: string; elapsed: number; done?: boolean; error?: string; result?: { title: string; scenes: number; episodeNumber: number } } | null>(null);

  async function generateEpisodeWithAi() {
    const hint = prompt(lang === "he" ? "רמז אופציונלי לפרק החדש (עלילה/טון/אירוע מרכזי). השאר ריק לאוטומטי:" : "Optional hint for the new episode. Leave empty for full auto:");
    if (hint === null) return;
    setGenBusy(true);
    const steps = lang === "he"
      ? ["קורא את הקאש של הסדרה", "מתכנן עלילת פרק", "יוצר את הפרק במסד נתונים", "מתכנן סצנות", "מייצר frames לכל סצנה", "מסיים"]
      : ["Reading series cache", "Planning episode plot", "Creating episode in DB", "Planning scenes", "Generating frames per scene", "Finalizing"];
    setGenProgress({ step: 0, total: steps.length, label: steps[0], elapsed: 0 });
    const started = Date.now();
    // Virtual-step advancer — moves forward on estimated timing (real endpoint is one-shot).
    const stepDurations = [3, 12, 2, 12, 20, 3]; // seconds per step, roughly
    const tick = setInterval(() => {
      const sec = Math.round((Date.now() - started) / 1000);
      let acc = 0; let idx = 0;
      for (let i = 0; i < stepDurations.length; i++) { acc += stepDurations[i]; if (sec < acc) { idx = i; break; } idx = stepDurations.length - 1; }
      setGenProgress((p) => p && !p.done ? { ...p, step: idx, label: steps[idx], elapsed: sec } : p);
    }, 1000);

    try {
      const r = await api<{ episodeNumber: number; title: string; scenes: number }>(`/api/v1/seasons/${id}/generate-episode`, { method: "POST", body: hint ? { hint } : {} });
      clearInterval(tick);
      setGenProgress((p) => p ? { ...p, step: steps.length - 1, label: steps[steps.length - 1], done: true, elapsed: Math.round((Date.now() - started) / 1000), result: r } : null);
      load();
    } catch (e) {
      clearInterval(tick);
      setGenProgress((p) => p ? { ...p, error: (e as Error).message, done: true, elapsed: Math.round((Date.now() - started) / 1000) } : null);
    } finally {
      setGenBusy(false);
    }
  }

  async function autoSeason() {
    setAutoBusy(true);
    try {
      const r = await api<{ created: { episodeId: string; title: string }[] }>(`/api/v1/seasons/${id}/auto-generate`, { method: "POST", body: { episodes: 5 } });
      alert((lang === "he" ? "נוצרו " : "Created ") + r.created.length + (lang === "he" ? " פרקים" : " episodes"));
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setAutoBusy(false); }
  }

  const [fbProgress, setFbProgress] = useState<{ step: number; total: number; label: string; elapsed: number; done?: boolean; error?: string } | null>(null);
  async function seasonFeedback() {
    setFeedback(null);
    const steps = lang === "he"
      ? ["טוען את הפרקים", "שולח לבמאי AI", "מקבל משוב", "מוכן"]
      : ["Loading episodes", "Sending to AI director", "Receiving feedback", "Ready"];
    setFbProgress({ step: 0, total: steps.length, label: steps[0], elapsed: 0 });
    const started = Date.now();
    const stepDurations = [2, 8, 8, 1];
    const tick = setInterval(() => {
      const sec = Math.round((Date.now() - started) / 1000);
      let acc = 0; let idx = 0;
      for (let i = 0; i < stepDurations.length; i++) { acc += stepDurations[i]; if (sec < acc) { idx = i; break; } idx = stepDurations.length - 1; }
      setFbProgress((p) => p && !p.done ? { ...p, step: idx, label: steps[idx], elapsed: sec } : p);
    }, 1000);
    try {
      const r = await api<typeof feedback>(`/api/v1/seasons/${id}/director-feedback`, { method: "POST" });
      clearInterval(tick);
      setFbProgress((p) => p ? { ...p, step: steps.length - 1, label: steps[steps.length - 1], done: true, elapsed: Math.round((Date.now() - started) / 1000) } : null);
      if (r) { setFeedback(r); setTimeout(() => setFbProgress(null), 1500); }
    } catch (e) {
      clearInterval(tick);
      setFbProgress((p) => p ? { ...p, error: (e as Error).message, done: true, elapsed: Math.round((Date.now() - started) / 1000) } : null);
    }
  }

  async function episodeFeedback(epId: string) {
    setEpFeedback({ episodeId: epId, data: null as any });
    const r = await api<NonNullable<typeof epFeedback>["data"]>(`/api/v1/episodes/${epId}/director-feedback`, { method: "POST" }).catch((e) => { alert((e as Error).message); return null; });
    if (r) setEpFeedback({ episodeId: epId, data: r });
    else setEpFeedback(null);
  }

  const [applying, setApplying] = useState<string | null>(null); // episode id being applied
  const [applyAllBusy, setApplyAllBusy] = useState(false);

  async function applyToEpisode(epId: string, fb?: NonNullable<typeof epFeedback>["data"]) {
    setApplying(epId);
    try {
      const r = await api<{ scenesRewritten: number; scenesTotal: number; episodeTitle: string }>(`/api/v1/episodes/${epId}/apply-feedback`, {
        method: "POST",
        body: fb ? { feedback: fb } : {},
      });
      alert((lang === "he" ? `יושמו ${r.scenesRewritten}/${r.scenesTotal} סצנות בפרק ` : `Applied to ${r.scenesRewritten}/${r.scenesTotal} scenes of `) + r.episodeTitle);
      setEpFeedback(null);
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setApplying(null); }
  }

  async function applyToAllEpisodes() {
    if (!confirm(lang === "he" ? `להחיל משוב במאי AI על כל ${episodes.length} הפרקים? כל סצנה תישכתב מחדש (גרסה ישנה תישמר).` : `Apply AI Director feedback to all ${episodes.length} episodes? Every scene will be rewritten (old version preserved).`)) return;
    setApplyAllBusy(true);
    try {
      let total = 0;
      for (const ep of episodes) {
        try {
          const r = await api<{ scenesRewritten: number }>(`/api/v1/episodes/${ep.id}/apply-feedback`, { method: "POST", body: {} });
          total += r.scenesRewritten;
        } catch (e) { console.warn("ep", ep.episodeNumber, "failed", e); }
      }
      alert((lang === "he" ? `יושם על ${total} סצנות בכל הפרקים.` : `Applied to ${total} scenes across all episodes.`));
      load();
    } finally { setApplyAllBusy(false); }
  }

  if (!season) return (
    <div className="text-text-muted">
      {err ? <span className="text-status-errText">Error: {err}</span> : "Loading…"}
    </div>
  );

  const epPercents = episodes.map((ep) => avg(ep.scenes.map((sc) => sceneProgress({ status: sc.status, scriptText: sc.scriptText, frames: sc.frames }))));
  const seasonPct = avg(epPercents);

  return (
    <div translate="no" className="notranslate space-y-4">
      <div className="bg-bg-card rounded-card border border-bg-main px-4 py-3 flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold truncate">
          <span className="text-text-muted font-normal text-sm">{season.series.project.name} · </span>
          {lang === "he" ? `עונה ${season.seasonNumber}` : `S${season.seasonNumber}`}{season.title && ` · ${season.title}`}
        </h1>
        <div className="flex items-center gap-1 ms-auto">
          <span className="text-lg font-bold num" style={{ color: progressColor(seasonPct) }}>{seasonPct}%</span>
          <span className="text-[10px] text-text-muted">{progressLabel(seasonPct, lang)}</span>
        </div>
        <div className="w-32 h-1.5 rounded-full bg-bg-main overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${seasonPct}%`, background: progressColor(seasonPct) }} />
        </div>
        <button onClick={seasonFeedback} className="px-3 py-1 rounded-lg border border-accent text-accent text-xs font-semibold whitespace-nowrap">🤖 {lang === "he" ? "במאי AI" : "AI Director"}</button>
      </div>

      <button onClick={() => router.push(`/projects/${season.series.project.id}`)} className="text-xs text-accent hover:underline">{lang === "he" ? "→" : "←"} {season.series.project.name}</button>

      {genProgress && <ProgressPanel title={lang === "he" ? "🎬 יוצר פרק עם AI" : "🎬 Generating episode"} p={genProgress} onClose={() => setGenProgress(null)} successText={genProgress.result ? (lang === "he" ? `נוצר פרק ${genProgress.result.episodeNumber}: ${genProgress.result.title} (${genProgress.result.scenes} סצנות)` : `Created EP${genProgress.result.episodeNumber}: ${genProgress.result.title} (${genProgress.result.scenes} scenes)`) : undefined} lang={lang} />}
      {fbProgress && <ProgressPanel title={lang === "he" ? "🤖 במאי AI קורא את העונה" : "🤖 AI director reading season"} p={fbProgress} onClose={() => setFbProgress(null)} lang={lang} />}

      {feedback && (
        <div id="director-feedback-panel" className="bg-bg-card rounded-card border border-accent p-5 space-y-3">
          <div className="flex justify-between items-start gap-3">
            <div className="text-sm font-bold">🤖 {lang === "he" ? "משוב הבמאי לעונה" : "Season Director Feedback"}</div>
            <div className="flex gap-2">
              <button disabled={applyAllBusy} onClick={applyToAllEpisodes} className="px-3 py-1 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50">
                {applyAllBusy ? (lang === "he" ? "מיישם…" : "Applying…") : (lang === "he" ? "✨ החל על כל הפרקים" : "✨ Apply to all episodes")}
              </button>
              <button onClick={() => setFeedback(null)} className="text-xs text-text-muted">✕</button>
            </div>
          </div>
          <div className="text-sm">{feedback.overall}</div>
          {feedback.arc && <div className="text-xs"><span className="font-semibold">{lang === "he" ? "קשת" : "Arc"}: </span>{feedback.arc}</div>}
          {feedback.pacing && <div className="text-xs"><span className="font-semibold">{lang === "he" ? "קצב" : "Pacing"}: </span>{feedback.pacing}</div>}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><div className="font-semibold mb-1 text-status-okText">{lang === "he" ? "חוזקות" : "Strengths"}</div><ul className="space-y-1">{feedback.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>
            <div><div className="font-semibold mb-1 text-status-warnText">{lang === "he" ? "בעיות" : "Concerns"}</div><ul className="space-y-1">{feedback.concerns.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>
            <div><div className="font-semibold mb-1 text-accent">{lang === "he" ? "המלצות" : "Suggestions"}</div><ul className="space-y-1">{feedback.suggestions.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-bg-main">
        <button
          onClick={() => setTab("episodes")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "episodes" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"}`}
        >
          {lang === "he" ? "פרקים" : "Episodes"} <span className="text-text-muted">({episodes.length})</span>
        </button>
        <button
          onClick={() => setTab("characters")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "characters" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"}`}
        >
          {lang === "he" ? "דמויות" : "Characters"} <span className="text-text-muted">({characters.length})</span>
        </button>
        <button
          onClick={() => setTab("opening")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "opening" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"}`}
        >
          🎬 {lang === "he" ? "פתיחה" : "Opening"}
        </button>
        <button
          onClick={() => setTab("logs")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "logs" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"}`}
        >
          {lang === "he" ? "לוגים וזיכרון" : "Logs & memory"}
        </button>
      </div>

      {tab === "episodes" && (
      <div className="bg-bg-card rounded-card border border-bg-main p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div>
            <div className="text-lg font-bold">{lang === "he" ? "פרקים" : "Episodes"} <span className="text-text-muted text-sm font-normal">· {episodes.length} {lang === "he" ? "פרקים" : "episodes"}</span></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold">+ {lang === "he" ? "פרק" : "Episode"}</button>
            <button disabled={genBusy} onClick={generateEpisodeWithAi} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">🤖 {genBusy ? (lang === "he" ? "מייצר פרק…" : "Generating…") : (lang === "he" ? "פרק חדש עם AI" : "New episode with AI")}</button>
            <button disabled={autoBusy} onClick={autoSeason} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">⚡ {autoBusy ? (lang === "he" ? "מייצר…" : "Generating…") : (lang === "he" ? "מילוי אוטומטי" : "Auto-fill season")}</button>
          </div>
        </div>
        {creating && (
          <form onSubmit={newEpisode} className="bg-bg-main rounded-lg p-3 mb-3 flex gap-2">
            <input name="t" required placeholder={lang === "he" ? "כותרת הפרק" : "Episode title"} className="flex-1 px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm">{lang === "he" ? "הוסף" : "Add"}</button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">{lang === "he" ? "בטל" : "Cancel"}</button>
          </form>
        )}
        {episodes.length === 0 ? (
          <div className="text-center py-8 text-text-muted">{lang === "he" ? "אין פרקים עדיין." : "No episodes yet."}</div>
        ) : (
          <ul className="space-y-2">
            {episodes.map((ep, i) => {
              const pct = epPercents[i];
              return (
                <li key={ep.id} className="bg-bg-main rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/episodes/${ep.id}`} className="flex-1 hover:text-accent">
                      <div className="flex items-baseline gap-2">
                        <span data-no-translate className="font-mono text-xs text-text-muted">EP{String(ep.episodeNumber).padStart(2, "0")}</span>
                        <span className="font-semibold">{ep.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[ep.status] ?? "bg-bg-card"}`}>{ep.status}</span>
                      </div>
                      {ep.synopsis && <div className="text-xs text-text-secondary mt-0.5 line-clamp-1">{ep.synopsis}</div>}
                    </Link>
                    <div className="text-end shrink-0">
                      <div className="text-lg font-bold num" style={{ color: progressColor(pct) }}>{pct}%</div>
                      <div className="text-[10px] text-text-muted">{progressLabel(pct, lang)}</div>
                      {costs[ep.id] !== undefined && costs[ep.id] > 0 && (
                        <div className="text-[11px] num mt-0.5 text-text-secondary" title={lang === "he" ? "עלות מצטברת לפרק" : "Accumulated episode cost"}>${costs[ep.id].toFixed(3)}</div>
                      )}
                    </div>
                    <button onClick={() => episodeFeedback(ep.id)} className="text-xs px-2 py-1 rounded border border-accent text-accent whitespace-nowrap shrink-0" title={lang === "he" ? "קבל משוב במאי AI על הפרק" : "Get AI Director feedback"}>🤖</button>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-card mt-2 overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${pct}%`, background: progressColor(pct) }} />
                  </div>
                  {ep.characters && ep.characters.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-text-muted">{lang === "he" ? "דמויות:" : "Characters:"}</span>
                      {ep.characters.map((ec) => (
                        <span key={ec.character.id} className="inline-flex items-center gap-1 text-[11px] bg-bg-card rounded-full pe-2 ps-0.5 py-0.5">
                          {ec.character.media[0] ? <img src={ec.character.media[0].fileUrl} alt="" className="w-4 h-4 rounded-full object-cover" /> : <span className="w-4 h-4 rounded-full bg-bg-main" />}
                          {ec.character.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {epFeedback?.episodeId === ep.id && epFeedback.data && (
                    <div className="mt-3 bg-bg-card rounded-lg p-3 text-xs space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-semibold">🤖 {lang === "he" ? "משוב לפרק" : "Episode feedback"}</div>
                        <div className="flex gap-2">
                          <button
                            disabled={applying === ep.id}
                            onClick={() => applyToEpisode(ep.id, epFeedback.data)}
                            className="px-2 py-0.5 rounded bg-accent text-white text-[11px] font-semibold disabled:opacity-50"
                          >
                            {applying === ep.id ? (lang === "he" ? "מיישם…" : "Applying…") : (lang === "he" ? "✨ החל על הפרק" : "✨ Apply to episode")}
                          </button>
                          <button onClick={() => setEpFeedback(null)} className="text-text-muted">✕</button>
                        </div>
                      </div>
                      <div>{epFeedback.data.overall}</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div><div className="font-semibold text-status-okText">{lang === "he" ? "חוזקות" : "Strengths"}</div><ul>{epFeedback.data.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>
                        <div><div className="font-semibold text-status-warnText">{lang === "he" ? "בעיות" : "Concerns"}</div><ul>{epFeedback.data.concerns.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>
                        <div><div className="font-semibold text-accent">{lang === "he" ? "המלצות" : "Suggestions"}</div><ul>{epFeedback.data.suggestions.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>
                      </div>
                      {epFeedback.data.sceneNotes && epFeedback.data.sceneNotes.length > 0 && (
                        <div className="border-t border-bg-main pt-2 mt-2">
                          <div className="font-semibold mb-1">{lang === "he" ? "הערות לסצנות" : "Scene notes"}</div>
                          <ul className="space-y-0.5">{epFeedback.data.sceneNotes.map((n) => <li key={n.sceneNumber}><span className="font-mono">SC{String(n.sceneNumber).padStart(2, "0")}:</span> {n.note}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

      {tab === "characters" && (
      <div className="bg-bg-card rounded-card border border-bg-main p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-lg font-bold">{lang === "he" ? "דמויות" : "Characters"} <span className="text-text-muted text-sm font-normal">· {characters.length}</span></div>
            <div className="text-xs text-text-muted">{lang === "he" ? "ראשיות חוזרות בסדרה" : "Recurring main"}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button disabled={charBusy === "populate"} onClick={autoPopulateChars} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
              {charBusy === "populate" ? (lang === "he" ? "מזהה…" : "Detecting…") : (lang === "he" ? "🪄 זהה מהפרקים" : "🪄 Detect")}
            </button>
            <button disabled={charBusy === "gallery" || characters.length === 0} onClick={generateAllGalleries} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
              {charBusy === "gallery" ? (lang === "he" ? "מייצר…" : "Generating…") : (lang === "he" ? "✨ תמונות" : "✨ Gallery")}
            </button>
            <button disabled={charBusy === "regen" || characters.length === 0} onClick={regenerateAllStoryboards} className="px-3 py-1.5 rounded-lg border-2 border-accent text-accent text-sm font-semibold disabled:opacity-50">
              {charBusy === "regen" ? (lang === "he" ? "מייצר מחדש…" : "Regenerating…") : (lang === "he" ? "🔁 תשריטים מחדש" : "🔁 Regen")}
            </button>
            <Link href={`/projects/${season.series.project.id}/characters`} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">{lang === "he" ? "ניהול מלא →" : "Manage →"}</Link>
          </div>
        </div>
        {characters.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <div className="text-3xl mb-2">🎭</div>
            <div>{lang === "he" ? "עדיין אין דמויות — לחץ 🪄 זהה מהפרקים" : "No characters yet — click 🪄 Detect from episodes"}</div>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {characters.map((c) => {
              const apps = episodes.filter((ep) => ep.characters?.some((ec) => ec.character.id === c.id));
              return (
                <li key={c.id} className="bg-bg-main rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <Link href={`/characters/${c.id}`} className="flex-1 min-w-0 hover:underline">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-[11px] text-text-muted" data-no-translate>{[c.roleType, c.gender, c.ageRange].filter(Boolean).join(" · ")}</div>
                    </Link>
                    <div className="flex flex-col gap-1 items-end">
                      {c.media.length === 0 ? (
                        <button disabled={charBusy === c.id} onClick={() => generateOneGallery(c.id, "one")} className="text-[11px] px-2 py-1 rounded-lg bg-accent text-white disabled:opacity-50">
                          {charBusy === c.id ? "…" : (lang === "he" ? "✨ בנה גיליון דמות" : "✨ Build sheet")}
                        </button>
                      ) : !c.media.some((m) => m.metadata?.angle === "sheet") ? (
                        <button disabled={charBusy === c.id} onClick={() => generateOneGallery(c.id, "rest")} className="text-[11px] px-2 py-1 rounded-lg border border-accent text-accent disabled:opacity-50" title={lang === "he" ? "מעבר לפורמט תמונה יחידה" : "Migrate to single-image sheet"}>
                          {charBusy === c.id ? "…" : (lang === "he" ? "🔄 צור גיליון" : "🔄 Build sheet")}
                        </button>
                      ) : (
                        // Sheet exists → offer rebuild. Fire the regenerate flow which
                        // wipes and generates a fresh sheet in one call (~$0.04).
                        <button disabled={charBusy === c.id} onClick={() => regenerateCharacter(c.id, c.name)} className="text-[11px] px-2 py-1 rounded-lg border border-accent text-accent disabled:opacity-50" title={lang === "he" ? "מוחק ומייצר גיליון חדש (~$0.04)" : "Wipe and generate a fresh sheet (~$0.04)"}>
                          {charBusy === c.id ? "…" : (lang === "he" ? "🔄 ייצר מחדש" : "🔄 Regenerate")}
                        </button>
                      )}
                      <span className="text-[10px] text-text-muted num">${c.media.reduce((s, m) => s + (m.cost ?? 0), 0).toFixed(3)}</span>
                    </div>
                  </div>
                  {c.appearance && <div className="text-[11px] text-text-secondary line-clamp-2">{c.appearance}</div>}
                  {(() => {
                    // Sheet-first display. Legacy 5-cell grid removed entirely — no empty cells.
                    const sheet = c.media.find((m) => m.metadata?.angle === "sheet");
                    if (sheet) {
                      return (
                        <button onClick={() => setLightbox({ character: c, index: c.media.indexOf(sheet) })} className="block w-full rounded overflow-hidden bg-bg-card group">
                          <img src={sheet.fileUrl} alt={`${c.name} sheet`} className="w-full h-auto object-contain group-hover:scale-[1.01] transition-transform" />
                        </button>
                      );
                    }
                    // Legacy multi-angle media — show them inline so nothing is lost, but
                    // don't fill missing slots with empty cells.
                    if (c.media.length > 0) {
                      return (
                        <div className="grid grid-cols-5 gap-1">
                          {c.media.slice(0, 5).map((m, i) => (
                            <button key={m.id} onClick={() => setLightbox({ character: c, index: i })} className="relative aspect-square rounded overflow-hidden bg-bg-card group">
                              <img src={m.fileUrl} alt={m.metadata?.angle ?? ""} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            </button>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {apps.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-bg-card">
                      <span className="text-[10px] text-text-muted">{lang === "he" ? "בעונה זו:" : "This season:"}</span>
                      {apps.map((ep) => (
                        <Link key={ep.id} href={`/episodes/${ep.id}`} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card hover:bg-accent/20" data-no-translate>EP{String(ep.episodeNumber).padStart(2, "0")}</Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

      {tab === "opening" && (
        <Card
          title={lang === "he" ? "🎬 פתיחת העונה" : "Season opening"}
          subtitle={lang === "he" ? "סרטון פתיחה שנוצר על ידי AI — בהתאם לסדרה, הדמויות ולסגנון שתבחר" : "AI-built intro — matches the series, cast, and style you pick"}
        >
          {!opening ? (
            <div className="text-center py-10">
              <div className="text-5xl mb-3">🎬</div>
              <div className="text-text-muted mb-4">{lang === "he" ? "עדיין אין פתיחה לעונה זו" : "No opening for this season yet"}</div>
              <button onClick={() => setOpeningWizardOpen(true)} className="px-5 py-2.5 rounded-lg bg-accent text-white font-semibold">{lang === "he" ? "✨ יצירת פתיחה עם AI" : "✨ Create opening with AI"}</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div id="opening-status" />
              {opening.status === "FAILED" ? (() => {
                const realErr = opening.videoUri?.startsWith("ERROR:") ? opening.videoUri.slice(6) : null;
                const isModeration = realErr ? /moderation/i.test(realErr) : false;
                return (
                <div className="bg-status-errBg rounded-lg p-5 text-center">
                  <div className="text-3xl mb-2">⚠️</div>
                  <div className="text-sm font-semibold text-status-errText mb-1">{lang === "he" ? "הייצור נכשל" : "Generation failed"}</div>
                  {realErr ? (
                    <div className="text-xs text-status-errText mb-4 text-left bg-bg-card rounded p-2 font-mono direction-ltr break-words">{realErr}</div>
                  ) : (
                    <div className="text-xs text-status-errText mb-4">{lang === "he" ? "סטטוס נכשל בלי הודעת שגיאה ספציפית. ייתכן שהוידאו דווקא הסתיים בהצלחה אצל הספק — לחץ 'אפס ונסה שוב' והדף יבדוק שוב." : "Failed status with no specific error. The video may actually be ready at the provider — click Reset to re-poll."}</div>
                  )}
                  {isModeration && (
                    <div className="text-xs text-status-errText mb-4">{lang === "he" ? "Sora חסם את הוידאו אחרי הרינדור — בדרך כלל בגלל פיזיקה אנומלית בתוצר (כספית נגד הכבידה / מראה באיחור). בקש מהבמאי פתיחה אסתטית טהורה ללא רמזים עלילתיים, או בחר מודל אחר (VEO 3 / SeeDance)." : "Sora blocked the rendered output — typically due to anomalous physics in the result. Author a pure-aesthetic opening or switch model (VEO 3 / SeeDance)."}</div>
                  )}
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button onClick={async () => {
                      await api(`/api/v1/seasons/${season.id}/opening`, { method: "PATCH", body: { status: "DRAFT" } });
                      const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
                      setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
                    }} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">{lang === "he" ? "🔄 אפס ונסה שוב" : "🔄 Reset and try again"}</button>
                    <button onClick={() => setOpeningWizardOpen(true)} className="px-4 py-2 rounded-lg border border-accent text-accent text-sm font-semibold">{lang === "he" ? "✨ ערוך באשף" : "✨ Edit in wizard"}</button>
                  </div>
                </div>
                );
              })() : (openingJob && !openingJob.done) || opening.status === "GENERATING" ? (
                (() => {
                  const totalChunks = Math.max(opening.chunkPrompts?.length ?? 1, 1);
                  const activeIdx = (opening.chunkIndex ?? 0) + 1; // 1-based for display
                  const isChain = totalChunks > 1;
                  return (
                    <div className="bg-bg-main rounded-lg p-5 space-y-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-semibold">
                            🎬 {lang === "he"
                              ? isChain
                                ? `${opening.model} · מייצר קטע ${activeIdx}/${totalChunks}`
                                : `${opening.model} מייצר גרסה חדשה…`
                              : isChain
                                ? `${opening.model} · rendering clip ${activeIdx}/${totalChunks}`
                                : `${opening.model} is rendering a new version…`}
                          </div>
                          <div className="text-[11px] text-text-muted mt-1">
                            {lang === "he"
                              ? isChain
                                ? `סה״כ ${totalChunks * 20}s · כל קטע 20s · שרשור אוטומטי (Sora extend)`
                                : "Sora מעבד — 60-90 שניות בד״כ, עד 4 דקות"
                              : isChain
                                ? `${totalChunks * 20}s total · 20s per chunk · auto-chain (Sora extend)`
                                : "Sora is rendering — typically 60-90s, up to 4min"}
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="text-[10px] text-text-muted uppercase tracking-widest">{lang === "he" ? "זמן שעבר" : "Elapsed"}</div>
                          <div className="text-3xl font-bold num">{openingJob?.elapsed ?? 0}s</div>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-bg-card overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{
                            width: `${isChain
                              ? Math.min(100, ((activeIdx - 1 + Math.min((openingJob?.elapsed ?? 0) / 90, 1)) / totalChunks) * 100)
                              : Math.min(100, ((openingJob?.elapsed ?? 0) / 90) * 100)}%`,
                          }}
                        />
                      </div>
                      {isChain && (
                        <div className="flex gap-1">
                          {Array.from({ length: totalChunks }).map((_, i) => {
                            const done = i < (opening.chunkIndex ?? 0);
                            const active = i === (opening.chunkIndex ?? 0);
                            return (
                              <div
                                key={i}
                                className={`flex-1 h-1.5 rounded-full ${done ? "bg-accent" : active ? "bg-accent/60 animate-pulse" : "bg-bg-card"}`}
                                title={`Chunk ${i + 1}/${totalChunks}`}
                              />
                            );
                          })}
                        </div>
                      )}
                      <div className="text-[11px] text-text-muted">
                        {lang === "he" ? "הדף יתרענן אוטומטית. שום לחיצה נוספת אינה נדרשת." : "Page auto-refreshes. No extra clicks needed."}
                      </div>
                    </div>
                  );
                })()
              ) : opening.videoUrl ? (
                <video src={opening.videoUrl} controls className="w-full max-w-2xl rounded-lg bg-black mx-auto" />
              ) : (
                <div className="bg-accent/5 border-2 border-dashed border-accent rounded-lg p-6 text-center">
                  <div className="text-4xl mb-2">🎬</div>
                  <div className="text-sm font-semibold mb-1">{lang === "he" ? "הפרומט נשמר — מוכן לייצור" : "Prompt saved — ready to render"}</div>
                  <div className="text-xs text-text-muted mb-4">{lang === "he" ? `${opening.model} · ${opening.duration}s · ${opening.aspectRatio} · ~$${({seedance:0.124,kling:0.056,"veo3-fast":0.40,"veo3-pro":0.75}[opening.model as "seedance"|"kling"|"veo3-fast"|"veo3-pro"] ?? 0.124) * opening.duration}` : `${opening.model} · ${opening.duration}s · ${opening.aspectRatio}`}</div>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button disabled={!!openingJob && !openingJob.done} onClick={async () => {
                      if (openingJob && !openingJob.done) return;
                      setOpeningJob({ startedAt: Date.now(), elapsed: 0, done: false });
                      document.getElementById("opening-status")?.scrollIntoView({ behavior: "smooth", block: "center" });
                      await api(`/api/v1/seasons/${season.id}/opening/generate`, { method: "POST", body: {} });
                      const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
                      setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
                    }} className="px-6 py-2.5 rounded-lg bg-accent text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">🎬 {lang === "he" ? "צור וידאו עכשיו" : "Generate video now"}</button>
                    <button disabled={!!openingJob && !openingJob.done} onClick={() => setOpeningWizardOpen(true)} className="px-6 py-2.5 rounded-lg border-2 border-accent text-accent font-bold bg-white disabled:opacity-50">✨ {lang === "he" ? "ערוך באשף" : "Edit in wizard"}</button>
                  </div>
                  <div className="text-[11px] text-text-muted mt-3">{lang === "he" ? "האשף יפתח עם כל ההגדרות הקיימות — סגנון, דמויות, מודל, פרומט — אפשר לשנות ולשמור שוב" : "Wizard re-opens with all current settings loaded — tweak and save again"}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="bg-bg-main rounded-full px-3 py-1 text-xs">{opening.styleLabel ?? opening.status}</span>
                <span className="bg-bg-main rounded-full px-3 py-1 text-xs">{opening.model} · {opening.duration}s · {opening.aspectRatio}</span>
                {opening.isSeriesDefault && <span className="bg-status-okBg text-status-okText rounded-full px-3 py-1 text-xs font-semibold">⭐ {lang === "he" ? "פתיחה ראשית לסדרה" : "Series default"}</span>}
              </div>
              {openingCosts && openingCosts.total > 0 && (
                <div className="rounded-card border border-bg-main bg-bg-card px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">💰 {lang === "he" ? "עלות AI של הפתיחה" : "Opening AI cost"}</div>
                    <div className="text-lg font-bold num text-accent">${openingCosts.total.toFixed(4)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="bg-bg-main rounded-full px-2 py-1">
                      <span className="text-text-secondary">✍ {lang === "he" ? "טקסט AI" : "Text AI"}</span>
                      <span className="num font-semibold ms-2">${openingCosts.text.toFixed(4)}</span>
                    </span>
                    <span className="bg-bg-main rounded-full px-2 py-1">
                      <span className="text-text-secondary">🎬 {lang === "he" ? "ייצור וידאו" : "Video"}</span>
                      <span className="num font-semibold ms-2">${openingCosts.video.toFixed(4)}</span>
                    </span>
                    <span className="bg-bg-main rounded-full px-2 py-1 text-text-muted">{openingCosts.calls} {lang === "he" ? "פעולות" : "ops"}</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-2">
                    {lang === "he" ? "מצטבר גם בלשונית כספי הסדרה" : "Also aggregated in Project Finance"}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setOpeningEditing(true); setOpeningPromptDraft(opening.currentPrompt); }} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold">✏ {lang === "he" ? "ערוך פרומט" : "Edit prompt"}</button>
                <button disabled={!!openingJob && !openingJob.done} onClick={async () => {
                  if (openingJob && !openingJob.done) return;
                  setOpeningJob({ startedAt: Date.now(), elapsed: 0, done: false });
                  await api(`/api/v1/seasons/${season.id}/opening/generate`, { method: "POST", body: {} });
                  const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
                  setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
                }} className={`${opening.videoUrl
                  ? "px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold"
                  : "px-5 py-2 rounded-lg bg-accent text-white text-sm font-bold"} disabled:opacity-50 disabled:cursor-not-allowed`
                }>🎬 {(openingJob && !openingJob.done) ? (lang === "he" ? "מייצר…" : "Rendering…") : opening.videoUrl ? (lang === "he" ? "צור גרסה חדשה" : "Generate new version") : (lang === "he" ? "צור וידאו" : "Generate video")}</button>
                <button onClick={async () => {
                  const next = !opening.isSeriesDefault;
                  await api(`/api/v1/seasons/${season.id}/opening`, { method: "PATCH", body: { isSeriesDefault: next } });
                  const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
                  setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
                }} className="px-3 py-1.5 rounded-lg border border-bg-main text-text-secondary text-sm">{opening.isSeriesDefault ? (lang === "he" ? "הסר סימון 'ראשית'" : "Unset series default") : (lang === "he" ? "⭐ סמן כפתיחה הראשית" : "⭐ Mark as series default")}</button>
                <button onClick={() => setOpeningWizardOpen(true)} className="px-3 py-1.5 rounded-lg border-2 border-accent text-accent text-sm font-semibold">✨ {lang === "he" ? "פתח באשף" : "Open wizard"}</button>
                <button onClick={async () => {
                  if (!confirm(lang === "he" ? "למחוק את הפתיחה?" : "Delete this opening?")) return;
                  await api(`/api/v1/seasons/${season.id}/opening`, { method: "DELETE" });
                  setOpening(null);
                }} className="px-3 py-1.5 rounded-lg border border-status-errText text-status-errText text-sm">🗑</button>
              </div>

              {openingEditing && (
                <div className="bg-bg-main rounded-lg p-3 space-y-2">
                  <textarea value={openingPromptDraft} onChange={(e) => setOpeningPromptDraft(e.target.value)} rows={10} className="w-full px-3 py-2 rounded-lg border border-bg-card font-mono text-xs" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setOpeningEditing(false)} className="px-3 py-1.5 rounded-lg border border-bg-card text-sm">{lang === "he" ? "ביטול" : "Cancel"}</button>
                    <button onClick={async () => {
                      await api(`/api/v1/seasons/${season.id}/opening`, { method: "PATCH", body: { prompt: openingPromptDraft } });
                      const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
                      setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
                      setOpeningEditing(false);
                    }} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">{lang === "he" ? "שמור גרסה" : "Save version"}</button>
                  </div>
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-sm font-semibold">🕘 {lang === "he" ? `גרסאות פרומט (${opening.versions.length})` : `Prompt versions (${opening.versions.length})`}</summary>
                <ul className="mt-3 space-y-2">
                  {opening.versions.map((v) => (
                    <li key={v.id} className="bg-bg-main rounded-lg p-3 flex gap-3 items-start">
                      <div className="flex-1 text-xs font-mono text-text-secondary whitespace-pre-wrap line-clamp-4">{v.prompt}</div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-text-muted">{new Date(v.createdAt).toLocaleString(lang === "he" ? "he-IL" : undefined)}</span>
                        <button onClick={async () => {
                          await api(`/api/v1/seasons/${season.id}/opening/restore/${v.id}`, { method: "POST" });
                          const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
                          setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
                        }} className="text-[11px] px-2 py-1 rounded bg-accent text-white font-semibold">🔁 {lang === "he" ? "שחזר" : "Restore"}</button>
                      </div>
                    </li>
                  ))}
                  {opening.versions.length === 0 && <li className="text-xs text-text-muted">{lang === "he" ? "אין גרסאות קודמות" : "No versions yet"}</li>}
                </ul>
              </details>

              <details open>
                <summary className="cursor-pointer text-sm font-semibold">🎞 {lang === "he" ? `היסטוריית סרטונים שנוצרו (${openingVideos.length})` : `Video generation history (${openingVideos.length})`}</summary>
                <div className="text-[11px] text-text-muted mt-1 mb-3">{lang === "he" ? "כל הסרטונים נשמרים — לחץ '⭐ קבע כראשי' כדי לבחור איזה מהם יוצג כפתיחה הפעילה." : "All videos are preserved — click '⭐ Set as active' to pick which plays as the active opening."}</div>
                <ul className="space-y-2">
                  {openingVideos.map((v, i) => {
                    const isActive = opening.videoUrl === v.fileUrl;
                    return (
                      <li key={v.id} className={`rounded-lg p-3 flex items-center gap-3 cursor-pointer transition hover:ring-2 hover:ring-accent ${isActive ? "bg-status-okBg border-2 border-status-okText" : "bg-bg-main"}`}
                          onClick={() => setPlayingVideo({ url: v.fileUrl, label: `${lang === "he" ? "גרסה" : "Generation"} #${openingVideos.length - i}${v.model ? ` · ${v.model}` : ""}` })}
                          title={lang === "he" ? "לחץ לנגן" : "Click to play"}>
                        <div className="relative shrink-0">
                          <video src={v.fileUrl} className="w-32 h-20 rounded bg-black object-cover" muted />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded opacity-0 hover:opacity-100 transition">
                            <span className="text-white text-2xl">▶</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="font-semibold flex items-center gap-2">
                            {lang === "he" ? `גרסה #${openingVideos.length - i}` : `Generation #${openingVideos.length - i}`}
                            {isActive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-okText text-white font-semibold">⭐ {lang === "he" ? "ראשי" : "Active"}</span>}
                          </div>
                          <div className="text-text-muted mt-0.5 flex flex-wrap gap-2">
                            {v.model && <span className="bg-bg-card rounded-full px-2 py-0.5">{v.model}</span>}
                            {v.durationSeconds && <span className="bg-bg-card rounded-full px-2 py-0.5">{v.durationSeconds}s</span>}
                            {v.costUsd != null && <span className="bg-bg-card rounded-full px-2 py-0.5 num text-status-errText">${v.costUsd.toFixed(4)}</span>}
                            <span className="bg-bg-card rounded-full px-2 py-0.5">{new Date(v.at).toLocaleString(lang === "he" ? "he-IL" : undefined)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!isActive && (
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              await api(`/api/v1/seasons/${season.id}/opening/set-active-video`, { method: "POST", body: { assetId: v.id } });
                              const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
                              setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
                            }} className="text-[11px] px-2 py-1 rounded bg-accent text-white font-semibold">⭐ {lang === "he" ? "קבע כראשי" : "Set as active"}</button>
                          )}
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await fetch(v.fileUrl);
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `opening-v${openingVideos.length - i}${v.model ? "-" + v.model : ""}.mp4`;
                              document.body.appendChild(a); a.click(); a.remove();
                              setTimeout(() => URL.revokeObjectURL(url), 2000);
                            } catch (err) { alert((err as Error).message); }
                          }} className="text-[11px] px-2 py-1 rounded border border-accent text-accent font-semibold">⬇ {lang === "he" ? "הורד" : "Download"}</button>
                          <a href={v.fileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] px-2 py-1 rounded border border-bg-card text-center">↗ {lang === "he" ? "פתח" : "Open"}</a>
                        </div>
                      </li>
                    );
                  })}
                  {openingVideos.length === 0 && <li className="text-xs text-text-muted">{lang === "he" ? "עדיין לא נוצרו סרטונים" : "No videos generated yet"}</li>}
                </ul>
              </details>
            </div>
          )}
        </Card>
      )}

      {openingWizardOpen && season && (
        <OpeningWizard
          seasonId={season.id}
          characters={characters as unknown as { id: string; name: string; roleType?: string | null; media: { fileUrl: string }[] }[]}
          he={lang === "he"}
          onCancel={() => setOpeningWizardOpen(false)}
          onFinished={async () => {
            setOpeningWizardOpen(false);
            const r = await api<{ opening: Opening | null; costBreakdown: OpeningCostBreakdown; videoHistory: OpeningVideo[] }>(`/api/v1/seasons/${season.id}/opening`);
            setOpening(r.opening); setOpeningCosts(r.costBreakdown); setOpeningVideos(r.videoHistory ?? []);
          }}
        />
      )}

      {tab === "logs" && (
      <Card title={lang === "he" ? "זיכרון הסדרה · לוגים" : "Series memory · Logs"} subtitle={lang === "he" ? "קאש שהבמאי AI קורא לפני כל יצירה — מתעדכן כל 5 דקות" : "Cache the AI director reads before generating anything — refreshed every 5 minutes"}>
        <div className="flex justify-end gap-2 mb-3 flex-wrap">
          <button disabled={ctxBusy} onClick={refreshContext} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
            {ctxBusy ? (lang === "he" ? "מרענן…" : "Refreshing…") : (lang === "he" ? "🔄 רענן עכשיו" : "🔄 Refresh now")}
          </button>
          <a href={`/api/v1/projects/${season.series.project.id}/context?format=text`} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold" download>
            {lang === "he" ? "⬇ TXT" : "⬇ TXT"}
          </a>
          <a href={`/api/v1/projects/${season.series.project.id}/context?format=pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold">
            {lang === "he" ? "⬇ PDF" : "⬇ PDF"}
          </a>
          <a href={`/api/v1/projects/${season.series.project.id}/context?format=json`} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold" download>
            {lang === "he" ? "⬇ JSON" : "⬇ JSON"}
          </a>
        </div>

        {!contextData?.cache ? (
          <div className="text-center py-8 text-text-muted">
            <div className="text-3xl mb-2">🧠</div>
            <div>{lang === "he" ? "הקאש עדיין לא נבנה — לחץ \"רענן עכשיו\"" : "No cache yet — click Refresh now"}</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 text-xs flex-wrap">
              <div className="bg-bg-main rounded-lg px-3 py-2"><div className="text-text-muted">{lang === "he" ? "עודכן" : "Updated"}</div><div className="font-semibold">{new Date(contextData.cache.updatedAt).toLocaleString()}</div></div>
              <div className="bg-bg-main rounded-lg px-3 py-2"><div className="text-text-muted">{lang === "he" ? "טוקנים" : "Tokens"}</div><div className="font-semibold num">~{contextData.cache.tokenCount}</div></div>
              <div className="bg-bg-main rounded-lg px-3 py-2"><div className="text-text-muted">{lang === "he" ? "פרקים בקאש" : "Episodes in cache"}</div><div className="font-semibold num">{contextData.cache.data?.buildStats?.episodes ?? 0}</div></div>
              <div className="bg-bg-main rounded-lg px-3 py-2"><div className="text-text-muted">{lang === "he" ? "דמויות" : "Characters"}</div><div className="font-semibold num">{contextData.cache.data?.buildStats?.characters ?? 0}</div></div>
            </div>

            <details open>
              <summary className="cursor-pointer text-sm font-semibold mb-2">{lang === "he" ? "סיכום (מה שהבמאי AI קורא)" : "Summary (what the AI director reads)"}</summary>
              <pre className="bg-bg-main rounded-lg p-3 text-xs whitespace-pre-wrap font-mono leading-relaxed mt-2">{contextData.cache.summary}</pre>
            </details>

            <details>
              <summary className="cursor-pointer text-sm font-semibold mb-2">{lang === "he" ? "נתוני JSON גולמיים" : "Raw JSON data"}</summary>
              <pre className="bg-bg-main rounded-lg p-3 text-[11px] overflow-auto max-h-96 font-mono mt-2">{JSON.stringify(contextData.cache.data, null, 2)}</pre>
            </details>

            <div>
              <div className="text-sm font-semibold mb-2">{lang === "he" ? `היסטוריית רענון קאש (${contextData.logs.length})` : `Cache refresh log (${contextData.logs.length})`}</div>
              {contextData.logs.length === 0 ? (
                <div className="text-xs text-text-muted">{lang === "he" ? "אין לוגים עדיין" : "No logs yet"}</div>
              ) : (
                <ul className="space-y-1">
                  {contextData.logs.map((l) => (
                    <li key={l.id} className="text-[11px] bg-bg-main rounded px-2 py-1 flex justify-between gap-3">
                      <span className="text-text-secondary flex-1 truncate">{l.decisionReason}</span>
                      <span className="text-text-muted shrink-0">{new Date(l.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>
      )}

      {tab === "logs" && (() => {
        const KIND_LABEL: Record<string, string> = lang === "he" ? {
          "frame-created": "🖼 מסגרת נוצרה", "frame-updated": "🖼 מסגרת עודכנה",
          "scene-created": "🎬 סצנה נוצרה", "scene-edited": "🎬 סצנה נערכה",
          "episode-created": "📺 פרק נוצר", "episode-edited": "📺 פרק נערך",
          "character-edited": "🎭 דמות נערכה", "character-image-created": "🎭 תמונת דמות נוצרה",
          "video-created": "🎞 סרטון נוצר", "asset-created": "📦 נכס נוצר",
          "ai-context_refresh": "🧠 רענון זיכרון AI", "ai-episode_generation": "🤖 יצירת פרק AI",
          "ai-scene_generation": "🤖 יצירת סצנות AI", "ai-director_feedback": "🤖 משוב במאי AI",
          "ai-character_generation": "🤖 יצירת דמויות AI", "ai-storyboard_generation": "🤖 יצירת תשריט AI",
          "cost-image": "🖼 תמונה (fal)", "cost-video": "🎬 וידאו (fal)",
          "cost-director-sheet": "🎬 דף במאי AI", "cost-sound-notes": "🔊 הערות סאונד AI",
          "cost-critic": "🧐 מבקר AI", "cost-breakdown": "📋 פירוק תסריט AI", "cost-dialogue": "💬 דיאלוג AI",
          "cost-seo": "🔍 SEO AI", "cost-subtitles": "📝 כתוביות AI", "cost-dubbing": "🗣 דיבוב AI",
          "cost-text-ai": "✍ טקסט AI", "cost-character-image": "🎭 תמונת דמות (fal)", "cost-other": "💰 עלות אחרת",
        } : {};
        const colorFor = (kind: string) => {
          if (kind === "cost-image" || kind === "cost-character-image" || kind.startsWith("frame") || kind === "asset-created") return "bg-accent/15 text-accent";
          if (kind === "cost-video" || kind === "video-created") return "bg-purple-100 text-purple-700";
          if (kind.startsWith("scene")) return "bg-status-warningBg text-status-warnText";
          if (kind.startsWith("episode")) return "bg-status-okBg text-status-okText";
          if (kind.startsWith("character")) return "bg-purple-100 text-purple-700";
          if (kind.startsWith("cost-")) return "bg-status-warningBg text-status-warnText";
          if (kind.startsWith("ai-")) return "bg-bg-main text-text-secondary";
          return "bg-bg-main text-text-muted";
        };
        const filtered = (activity ?? []).filter((r) => r.kind !== "ai-context_refresh"); // cache refreshes already above
        return (
          <Card title={lang === "he" ? "כל הפעולות בפרויקט · Activity" : "All project activity"} subtitle={lang === "he" ? "תמונות, סרטונים, עריכות, ויצירות AI — מסונן בסדר זמן יורד" : "Images, videos, edits, and AI generations — newest first"}>
            {activity === null ? (
              <div className="text-center py-8 text-text-muted text-sm">{lang === "he" ? "טוען…" : "Loading…"}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">{lang === "he" ? "אין פעולות עדיין" : "No activity yet"}</div>
            ) : (
              <ul className="space-y-1 max-h-[600px] overflow-auto">
                {filtered.map((r) => (
                  <li key={r.id} className="text-xs bg-bg-main rounded px-2 py-1.5 flex items-center gap-3">
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${colorFor(r.kind)}`}>
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </span>
                    <span className="flex-1 truncate text-text-secondary">{r.title}</span>
                    {r.detail && r.detail.startsWith("$") && <span className="shrink-0 text-[10px] num font-semibold text-status-errText">{r.detail}</span>}
                    {r.actor && <span className="text-[10px] text-text-muted shrink-0">{r.actor}</span>}
                    <span className="text-[10px] text-text-muted shrink-0">{new Date(r.at).toLocaleString(lang === "he" ? "he-IL" : undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })()}

      {preview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setPreview(null)}>
          <div className="bg-bg-card rounded-card max-w-3xl w-full max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-bg-main sticky top-0 bg-bg-card z-10">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="font-bold text-lg">{lang === "he" ? "דמויות שזוהו" : "Proposed characters"}</h3>
                  <p className="text-xs text-text-muted mt-1">{lang === "he" ? "זה מה שה-AI זיהה מהפרקים. עבור על הרשימה ולחץ 'יישם' כדי לשמור. הסר שורה בלחיצה על ✕." : "This is what the AI found. Review and click 'Apply' to save. Click ✕ to drop a row."}</p>
                </div>
                <button onClick={() => setPreview(null)} className="text-text-muted">✕</button>
              </div>
            </div>
            <ul className="p-5 space-y-3">
              {preview.length === 0 && <li className="text-center text-text-muted">{lang === "he" ? "לא זוהו דמויות" : "No characters found"}</li>}
              {preview.map((c, i) => (
                <li key={i} className="bg-bg-main rounded-lg p-3 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="font-semibold">
                        {c.name}
                        {c.alreadyExists && <span className="ms-2 text-[10px] text-status-warnText bg-status-warningBg rounded-full px-2 py-0.5">{lang === "he" ? "כבר קיימת" : "already exists"}</span>}
                      </div>
                      <div className="text-[11px] text-text-muted">{[c.roleType, c.gender, c.ageRange].filter(Boolean).join(" · ")}</div>
                    </div>
                    <button onClick={() => setPreview(preview.filter((_, j) => j !== i))} className="text-xs text-status-errText">✕</button>
                  </div>
                  {c.appearance && <div className="mt-1 text-xs"><span className="text-text-muted">{lang === "he" ? "מראה: " : "Appearance: "}</span>{c.appearance}</div>}
                  {c.personality && <div className="text-xs"><span className="text-text-muted">{lang === "he" ? "אופי: " : "Personality: "}</span>{c.personality}</div>}
                  {c.wardrobeRules && <div className="text-xs"><span className="text-text-muted">{lang === "he" ? "תלבושת: " : "Wardrobe: "}</span>{c.wardrobeRules}</div>}
                  {c.appearsInEpisodes.length > 0 && (
                    <div className="text-[11px] text-text-muted mt-1">{lang === "he" ? "מופיעה ב-" : "Appears in "}{c.appearsInEpisodes.map((n) => `EP${String(n).padStart(2, "0")}`).join(", ")}</div>
                  )}
                </li>
              ))}
            </ul>
            <div className="p-5 border-t border-bg-main sticky bottom-0 bg-bg-card flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">{lang === "he" ? "בטל" : "Cancel"}</button>
              <button disabled={charBusy === "populate" || preview.length === 0} onClick={applyPreview} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
                {charBusy === "populate" ? (lang === "he" ? "שומר…" : "Saving…") : (lang === "he" ? `✓ יישם ${preview.length} דמויות` : `✓ Apply ${preview.length} characters`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (() => {
        const g = lightbox.character.media;
        const m = g[lightbox.index];
        if (!m) return null;
        const go = (delta: number) => setLightbox({ character: lightbox.character, index: (lightbox.index + delta + g.length) % g.length });
        const created = m.createdAt ? new Date(m.createdAt).toLocaleString() : "—";
        const provider = m.metadata?.provider ?? "fal.ai/nano-banana";
        return (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50" onClick={() => setLightbox(null)}>
            <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center gap-2">
                {g.length > 1 && <button onClick={() => go(lang === "he" ? 1 : -1)} className="bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full shrink-0 text-xl">‹</button>}
                <img src={m.fileUrl} alt={m.metadata?.angle ?? ""} className="max-w-full max-h-[80vh] rounded-lg" />
                {g.length > 1 && <button onClick={() => go(lang === "he" ? -1 : 1)} className="bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full shrink-0 text-xl">›</button>}
              </div>
              <button onClick={() => setLightbox(null)} className="absolute top-2 end-2 bg-black/70 text-white w-8 h-8 rounded-full">✕</button>
              <div className="mt-3 bg-black/70 text-white rounded-lg p-3 text-xs flex flex-wrap gap-x-6 gap-y-1 items-center">
                <div><span className="text-white/60">{lang === "he" ? "דמות" : "Character"}: </span><span className="font-semibold">{lightbox.character.name}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "זווית" : "Angle"}: </span><span className="font-semibold">{m.metadata?.angle ?? "—"}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "מודל" : "Model"}: </span><span className="font-semibold">{provider}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "נוצר" : "Created"}: </span><span className="num">{created}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "עלות" : "Cost"}: </span><span className="num font-semibold">${(m.cost ?? 0).toFixed(4)}</span></div>
                <div className="ms-auto text-white/60 num">{lightbox.index + 1} / {g.length}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {playingVideo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPlayingVideo(null)}>
          <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPlayingVideo(null)} className="absolute -top-10 end-0 text-white text-2xl leading-none px-2">✕</button>
            <div className="flex items-center justify-between mb-2">
              <div className="text-white text-sm font-semibold">{playingVideo.label}</div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(playingVideo.url);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${playingVideo.label.replace(/[^\w.-]+/g, "_")}.mp4`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                  } catch (e) { alert((e as Error).message); }
                }}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold"
              >⬇ {lang === "he" ? "הורד באיכות מקסימלית" : "Download (max quality)"}</button>
            </div>
            <video src={playingVideo.url} controls autoPlay className="w-full rounded-lg bg-black" />
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressPanel({ title, p, onClose, successText, lang }: {
  title: string;
  p: { step: number; total: number; label: string; elapsed: number; done?: boolean; error?: string };
  onClose: () => void;
  successText?: string;
  lang: string;
}) {
  const pct = p.done ? 100 : Math.min(99, Math.round(((p.step + 1) / p.total) * 100));
  const he = lang === "he";
  return (
    <div className={`bg-bg-card rounded-card border p-4 space-y-3 ${p.error ? "border-status-errText" : p.done ? "border-status-okText" : "border-accent"}`}>
      <div className="flex justify-between items-center">
        <div className="font-semibold text-sm">{title}</div>
        <button onClick={onClose} className="text-text-muted text-xs">✕</button>
      </div>
      {p.error ? (
        <div className="text-sm text-status-errText">⚠ {p.error}</div>
      ) : (
        <>
          <div className="flex justify-between items-center text-xs text-text-muted">
            <span>{p.done ? (he ? "✅ הושלם" : "✅ Done") : `${p.label} (${p.step + 1}/${p.total})`}</span>
            <span className="num">{p.elapsed}s</span>
          </div>
          <div className="h-2 rounded-full bg-bg-main overflow-hidden">
            <div className={`h-full transition-all ${p.done ? "bg-status-okText" : "bg-accent"}`} style={{ width: `${pct}%` }} />
          </div>
          {p.done && successText && <div className="text-sm text-status-okText">{successText}</div>}
        </>
      )}
    </div>
  );
}
