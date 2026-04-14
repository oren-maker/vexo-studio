"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { sceneProgress, avg, progressColor, progressLabel } from "@/lib/progress";
import { useLang } from "@/lib/i18n";

type Frame = { generatedImageUrl: string | null; approvedImageUrl: string | null };
type Scene = { status: string; scriptText: string | null; frames: Frame[] };
type Episode = { id: string; episodeNumber: number; title: string; status: string; scenes: Scene[] };
type Season = { id: string; seasonNumber: number; title: string | null; episodes: Episode[] };
type Project = { id: string; name: string; contentType: string; status: string; description?: string | null; genreTag?: string | null };

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const lang = useLang();
  const [project, setProject] = useState<Project | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [autoBusy, setAutoBusy] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ overall: string; arc?: string; pacing?: string; strengths: string[]; concerns: string[]; suggestions: string[] } | null>(null);

  async function load() {
    const r = await api<{ project: Project; seasons: Season[] }>(`/api/v1/projects/${id}/seasons`).catch(() => null);
    if (r) { setProject(r.project); setSeasons(r.seasons); }
  }
  useEffect(() => { load(); }, [id]);

  async function projectFeedback() {
    if (seasons.length === 0) return alert(lang === "he" ? "אין עונות עדיין" : "No seasons yet");
    setFeedback(null);
    const r = await api<typeof feedback>(`/api/v1/seasons/${seasons[0].id}/director-feedback`, { method: "POST" }).catch((e) => { alert((e as Error).message); return null; });
    if (r) setFeedback(r);
  }

  async function newSeason() {
    setCreateBusy(true);
    try { await api(`/api/v1/projects/${id}/seasons`, { method: "POST", body: {} }); load(); }
    finally { setCreateBusy(false); }
  }

  async function autoGenerateSeason(useExisting?: string) {
    let seasonId = useExisting;
    if (!seasonId) {
      const created = await api<{ id: string }>(`/api/v1/projects/${id}/seasons`, { method: "POST", body: {} });
      seasonId = created.id;
    }
    setAutoBusy(seasonId!);
    try {
      const r = await api<{ created: { episodeId: string; title: string }[] }>(`/api/v1/seasons/${seasonId}/auto-generate`, { method: "POST", body: { episodes: 5 } });
      alert((lang === "he" ? "נוצרו " : "Created ") + r.created.length + (lang === "he" ? " פרקים אוטומטית" : " episodes"));
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setAutoBusy(null); }
  }

  if (!project) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <div className="text-xs text-text-muted">{project.contentType.replace("_", " ")}{project.genreTag && ` · ${project.genreTag}`}</div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          {project.description && <p className="text-text-secondary mt-1">{project.description}</p>}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-xs px-3 py-1 rounded-full bg-bg-main font-bold">{project.status}</span>
          <button onClick={projectFeedback} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold whitespace-nowrap">🤖 {lang === "he" ? "במאי AI · משוב" : "AI Director · Feedback"}</button>
        </div>
      </div>

      {feedback && (
        <div className="bg-bg-card rounded-card border border-accent p-5 space-y-3">
          <div className="flex justify-between"><div className="text-sm font-bold">🤖 {lang === "he" ? "משוב של במאי AI" : "AI Director Feedback"}</div><button onClick={() => setFeedback(null)} className="text-xs text-text-muted">✕</button></div>
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

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Link href={`/projects/${id}/characters`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">🎭 {lang === "he" ? "דמויות" : "Characters"}</Link>
        <Link href={`/projects/${id}/finance`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">💰 {lang === "he" ? "כספים" : "Finance"}</Link>
        <Link href={`/projects/${id}/distribution`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">📡 {lang === "he" ? "הפצה" : "Distribution"}</Link>
        <Link href={`/projects/${id}/analytics`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">📊 {lang === "he" ? "אנליטיקס" : "Analytics"}</Link>
        <Link href={`/projects/${id}/calendar`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">📅 {lang === "he" ? "לוח שנה" : "Calendar"}</Link>
        <Link href={`/projects/${id}/ai-director`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">🤖 {lang === "he" ? "במאי AI" : "AI Director"}</Link>
      </div>

      <Card title={lang === "he" ? "עונות" : "Seasons"} subtitle={lang === "he" ? "כל עונה כוללת מספר פרקים" : "Each season groups episodes"}>
        <div className="flex justify-between mb-4">
          <span className="text-xs text-text-muted">{seasons.length} {lang === "he" ? "עונות" : "seasons"}</span>
          <div className="flex gap-2">
            <button disabled={createBusy} onClick={newSeason} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">+ {lang === "he" ? "עונה חדשה" : "New season"}</button>
            <button disabled={!!autoBusy} onClick={() => autoGenerateSeason()} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">⚡ {autoBusy ? (lang === "he" ? "מייצר…" : "Generating…") : (lang === "he" ? "עונה אוטומטית מלאה" : "Full auto season")}</button>
          </div>
        </div>

        {seasons.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <div className="text-3xl mb-2">📺</div>
            <div>{lang === "he" ? "אין עונות עדיין" : "No seasons yet"}</div>
          </div>
        ) : (
          <ul className="space-y-3">
            {seasons.map((s) => {
              const epProgresses = s.episodes.map((ep) => avg(ep.scenes.map((sc) => sceneProgress({ status: sc.status, scriptText: sc.scriptText, frames: sc.frames }))));
              const seasonPct = avg(epProgresses);
              return (
                <li key={s.id}>
                  <Link href={`/seasons/${s.id}`} className="block bg-bg-main rounded-lg p-4 hover:bg-bg-main/60">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="font-semibold">{lang === "he" ? `עונה ${s.seasonNumber}` : `Season ${s.seasonNumber}`}{s.title && ` · ${s.title}`}</div>
                        <div className="text-xs text-text-muted mt-0.5">{s.episodes.length} {lang === "he" ? "פרקים" : "episodes"}</div>
                      </div>
                      <div className="text-end shrink-0">
                        <div className="text-2xl font-bold num" style={{ color: progressColor(seasonPct) }}>{seasonPct}%</div>
                        <div className="text-[10px] text-text-muted">{progressLabel(seasonPct, lang)}</div>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-bg-card mt-3 overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${seasonPct}%`, background: progressColor(seasonPct) }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
