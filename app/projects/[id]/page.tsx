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
type Project = { id: string; name: string; contentType: string; status: string; description?: string | null; genreTag?: string | null; language?: string };

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

  const [editingName, setEditingName] = useState(false);
  const [editingPremise, setEditingPremise] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function saveField(field: "name" | "description", value: string) {
    await api(`/api/v1/projects/${id}`, { method: "PATCH", body: { [field]: value } });
    setEditingName(false);
    setEditingPremise(false);
    load();
  }

  async function aiDraftPremise() {
    setAiBusy(true);
    try {
      const r = await api<{ premise: string }>(`/api/v1/projects/${id}/premise-suggest`, { method: "POST" });
      if (r.premise) {
        if (confirm((lang === "he" ? "ההצעה מהבמאי:\n\n" : "Director's suggestion:\n\n") + r.premise + (lang === "he" ? "\n\nלשמור?" : "\n\nSave?"))) {
          await saveField("description", r.premise);
        }
      }
    } catch (e) { alert((e as Error).message); }
    finally { setAiBusy(false); }
  }

  const [feedbackBusy, setFeedbackBusy] = useState(false);
  async function projectFeedback() {
    if (seasons.length === 0) return alert(lang === "he" ? "אין עונות עדיין — צור עונה לפני שאפשר לקבל משוב" : "No seasons yet — create one first");
    setFeedback(null);
    setFeedbackBusy(true);
    try {
      const r = await api<{ overall: string; arc?: string; pacing?: string; strengths: string[]; concerns: string[]; suggestions: string[] }>(`/api/v1/seasons/${seasons[0].id}/director-feedback`, { method: "POST", body: {} });
      if (r) {
        setFeedback(r);
        // Scroll to the feedback panel since it renders below the fold
        setTimeout(() => document.getElementById("director-feedback-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    } catch (e) { alert((e as Error).message); }
    finally { setFeedbackBusy(false); }
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
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-muted flex items-center gap-2 flex-wrap">
            <span>{project.contentType.replace("_", " ")}{project.genreTag && ` · ${project.genreTag}`}</span>
            <span className="inline-flex items-center gap-1 bg-bg-main rounded-full ps-1 pe-0.5 py-0.5">
              <span className="text-[10px]">{lang === "he" ? "שפת הסדרה:" : "Series language:"}</span>
              <select
                value={project.language ?? "en"}
                onChange={async (e) => { await api(`/api/v1/projects/${id}`, { method: "PATCH", body: { language: e.target.value } }); load(); }}
                className="text-[11px] font-semibold bg-transparent border-0 focus:ring-0 cursor-pointer"
                title={lang === "he" ? "שפת התוכן שייוצר לסדרה הזו" : "Language the AI will write this series in"}
              >
                <option value="he">עברית</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="ru">Русский</option>
                <option value="pt">Português</option>
                <option value="it">Italiano</option>
                <option value="ja">日本語</option>
                <option value="zh">中文</option>
              </select>
            </span>
          </div>
          {editingName ? (
            <input
              autoFocus
              defaultValue={project.name}
              onBlur={(e) => saveField("name", e.target.value || project.name)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingName(false); }}
              className="text-3xl font-bold bg-bg-main rounded-lg px-2 py-1 w-full"
            />
          ) : (
            <h1 className="text-3xl font-bold group cursor-text" onClick={() => setEditingName(true)} title={lang === "he" ? "לחץ לעריכה" : "Click to edit"}>
              {project.name}<span className="opacity-0 group-hover:opacity-50 text-base ms-2">✎</span>
            </h1>
          )}
          {editingPremise ? (
            <div className="mt-2">
              <textarea
                autoFocus
                defaultValue={project.description ?? ""}
                onBlur={(e) => saveField("description", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingPremise(false); }}
                rows={3}
                placeholder={lang === "he" ? "תיאור כללי / פרמיס — על מה הסדרה" : "Premise — what the series is about"}
                className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm"
              />
              <div className="text-[11px] text-text-muted mt-1">{lang === "he" ? "Esc לביטול · יציאה שומרת" : "Esc to cancel · blur saves"}</div>
            </div>
          ) : (
            <div className="mt-1 group">
              {project.description ? (
                <p className="text-text-secondary cursor-text inline" onClick={() => setEditingPremise(true)}>{project.description}<span className="opacity-0 group-hover:opacity-50 text-xs ms-2">✎</span></p>
              ) : (
                <button onClick={() => setEditingPremise(true)} className="text-xs text-text-muted hover:text-accent">+ {lang === "he" ? "הוסף תיאור / פרמיס לסדרה" : "Add premise / description"}</button>
              )}
              <button disabled={aiBusy} onClick={aiDraftPremise} className="ms-2 text-[11px] text-accent hover:underline disabled:opacity-50">
                {aiBusy ? (lang === "he" ? "חושב…" : "Thinking…") : (lang === "he" ? "🤖 הצע עם AI" : "🤖 Suggest with AI")}
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <span className="text-xs px-3 py-1 rounded-full bg-bg-main font-bold">{project.status}</span>
          <button disabled={feedbackBusy} onClick={projectFeedback} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold whitespace-nowrap disabled:opacity-50">🤖 {feedbackBusy ? (lang === "he" ? "חושב…" : "Thinking…") : (lang === "he" ? "משוב במאי" : "Director feedback")}</button>
        </div>
      </div>

      {feedback && (
        <div id="director-feedback-panel" className="bg-bg-card rounded-card border border-accent p-5 space-y-3">
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


      <div className="bg-bg-card rounded-card border border-bg-main p-5">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-lg font-bold">{lang === "he" ? "עונות" : "Seasons"} <span className="text-text-muted text-sm font-normal">· {seasons.length}</span></div>
            <div className="text-xs text-text-muted">{lang === "he" ? "כל עונה כוללת מספר פרקים" : "Each season groups episodes"}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
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
      </div>
    </div>
  );
}
