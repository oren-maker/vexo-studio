"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { sceneProgress, avg, progressColor, progressLabel } from "@/lib/progress";
import { useLang } from "@/lib/i18n";

type Frame = { generatedImageUrl: string | null; approvedImageUrl: string | null };
type Scene = { id: string; sceneNumber: number; status: string; scriptText: string | null; frames: Frame[] };
type Episode = { id: string; episodeNumber: number; title: string; synopsis: string | null; status: string; scenes: Scene[] };
type Season = { id: string; seasonNumber: number; title: string | null; description: string | null; series: { project: { id: string; name: string } } };

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

  async function load() {
    const s = await api<Season>(`/api/v1/seasons/${id}`).catch(() => null);
    if (s) setSeason(s);
    const eps = await api<Episode[]>(`/api/v1/seasons/${id}/episodes`).catch(() => [] as Episode[]);
    // Hydrate scenes for each episode for progress calc
    const hydrated: Episode[] = await Promise.all(eps.map(async (e) => {
      const detail = await api<{ scenes: Scene[] }>(`/api/v1/episodes/${e.id}`).catch(() => ({ scenes: [] as Scene[] }));
      return { ...e, scenes: detail.scenes ?? [] };
    }));
    setEpisodes(hydrated);
  }
  useEffect(() => { load(); }, [id]);

  async function newEpisode(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    await api(`/api/v1/seasons/${id}/episodes`, { method: "POST", body: { episodeNumber: episodes.length + 1, title: (f.elements.namedItem("t") as HTMLInputElement).value } });
    setCreating(false); load();
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

  async function seasonFeedback() {
    setFeedback(null);
    const r = await api<typeof feedback>(`/api/v1/seasons/${id}/director-feedback`, { method: "POST" }).catch((e) => { alert((e as Error).message); return null; });
    if (r) setFeedback(r);
  }

  async function episodeFeedback(epId: string) {
    setEpFeedback({ episodeId: epId, data: null as any });
    const r = await api<typeof epFeedback["data"]>(`/api/v1/episodes/${epId}/director-feedback`, { method: "POST" }).catch((e) => { alert((e as Error).message); return null; });
    if (r) setEpFeedback({ episodeId: epId, data: r });
    else setEpFeedback(null);
  }

  if (!season) return <div className="text-text-muted">Loading…</div>;

  const epPercents = episodes.map((ep) => avg(ep.scenes.map((sc) => sceneProgress({ status: sc.status, scriptText: sc.scriptText, frames: sc.frames }))));
  const seasonPct = avg(epPercents);

  return (
    <div className="space-y-6">
      <button onClick={() => router.push(`/projects/${season.series.project.id}`)} className="text-sm text-accent">← {season.series.project.name}</button>

      <div className="bg-bg-card rounded-card border border-bg-main p-6">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="text-xs text-text-muted">{season.series.project.name}</div>
            <h1 className="text-3xl font-bold mt-1">{lang === "he" ? `עונה ${season.seasonNumber}` : `Season ${season.seasonNumber}`}{season.title && ` · ${season.title}`}</h1>
            {season.description && <p className="text-text-secondary mt-2">{season.description}</p>}
          </div>
          <div className="text-end shrink-0">
            <div className="text-4xl font-bold num" style={{ color: progressColor(seasonPct) }}>{seasonPct}%</div>
            <div className="text-xs text-text-muted">{progressLabel(seasonPct, lang)}</div>
            <button onClick={seasonFeedback} className="mt-3 px-3 py-1.5 rounded-lg border border-accent text-accent text-xs font-semibold whitespace-nowrap">🤖 {lang === "he" ? "במאי AI · משוב" : "AI Director · Feedback"}</button>
          </div>
        </div>
        <div className="h-2 rounded-full bg-bg-main mt-4 overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${seasonPct}%`, background: progressColor(seasonPct) }} />
        </div>
      </div>

      {feedback && (
        <div className="bg-bg-card rounded-card border border-accent p-5 space-y-3">
          <div className="flex justify-between"><div className="text-sm font-bold">🤖 {lang === "he" ? "משוב הבמאי לעונה" : "Season Director Feedback"}</div><button onClick={() => setFeedback(null)} className="text-xs text-text-muted">✕</button></div>
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

      <Card title={lang === "he" ? "פרקים" : "Episodes"} subtitle={`${episodes.length} ${lang === "he" ? "פרקים" : "episodes"}`}>
        <div className="flex justify-end gap-2 mb-3">
          <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold">+ {lang === "he" ? "פרק" : "Episode"}</button>
          <button disabled={autoBusy} onClick={autoSeason} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">⚡ {autoBusy ? (lang === "he" ? "מייצר…" : "Generating…") : (lang === "he" ? "מילוי אוטומטי" : "Auto-fill season")}</button>
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
                        <span className="font-mono text-xs text-text-muted">EP{String(ep.episodeNumber).padStart(2, "0")}</span>
                        <span className="font-semibold">{ep.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[ep.status] ?? "bg-bg-card"}`}>{ep.status}</span>
                      </div>
                      {ep.synopsis && <div className="text-xs text-text-secondary mt-0.5 line-clamp-1">{ep.synopsis}</div>}
                    </Link>
                    <div className="text-end shrink-0">
                      <div className="text-lg font-bold num" style={{ color: progressColor(pct) }}>{pct}%</div>
                      <div className="text-[10px] text-text-muted">{progressLabel(pct, lang)}</div>
                    </div>
                    <button onClick={() => episodeFeedback(ep.id)} className="text-xs px-2 py-1 rounded border border-accent text-accent whitespace-nowrap shrink-0" title={lang === "he" ? "קבל משוב במאי AI על הפרק" : "Get AI Director feedback"}>🤖</button>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-card mt-2 overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${pct}%`, background: progressColor(pct) }} />
                  </div>
                  {epFeedback?.episodeId === ep.id && epFeedback.data && (
                    <div className="mt-3 bg-bg-card rounded-lg p-3 text-xs space-y-2">
                      <div className="flex justify-between"><div className="font-semibold">🤖 {lang === "he" ? "משוב לפרק" : "Episode feedback"}</div><button onClick={() => setEpFeedback(null)} className="text-text-muted">✕</button></div>
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
      </Card>
    </div>
  );
}
