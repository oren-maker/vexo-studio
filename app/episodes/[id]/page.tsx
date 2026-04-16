"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { EpisodeMergedVideo } from "@/components/episode-merged-video";
import { useLang } from "@/lib/i18n";

type EpChar = { character: { id: string; name: string; roleType: string | null; media: { fileUrl: string }[] } };
type Episode = { id: string; episodeNumber: number; title: string; synopsis: string | null; status: string; actualCost: number; revenueTotal: number; publishedAt: string | null; seasonId: string; characters?: EpChar[] };
type Scene = { id: string; sceneNumber: number; title: string | null; status: string; actualCost: number };

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-bg-main text-text-secondary",
  PLANNING: "bg-status-warningBg text-status-warnText",
  IN_PRODUCTION: "bg-status-warningBg text-status-warnText",
  REVIEW: "bg-status-warningBg text-status-warnText",
  READY_FOR_PUBLISH: "bg-accent/20 text-accent",
  PUBLISHED: "bg-status-okBg text-status-okText",
  ARCHIVED: "bg-bg-main text-text-muted",
};

export default function EpisodePage() {
  const { id } = useParams<{ id: string }>();
  const lang = useLang();
  const [ep, setEp] = useState<Episode | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [creating, setCreating] = useState(false);
  const [costs, setCosts] = useState<{ total: number; breakdown: { episode: number; scenes: number; frames: number; characterMedia: number }; byCategory: Record<string, number> } | null>(null);
  const [tab, setTab] = useState<"scenes" | "costs">("scenes");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const he = lang === "he";

  async function generateScenesAI() {
    setAiBusy(true);
    setAiMsg(he ? "סוקר פרקים קודמים, דמויות והשתלשלות העלילה…" : "Reviewing prior episodes, cast, and arc…");
    try {
      const r = await api<{ scenesCreated: number; framesCreated: number; priorEpisodesReviewed: number }>(
        `/api/v1/episodes/${id}/scenes/generate-ai`,
        { method: "POST", body: { scenesCount: 4, framesPerScene: 3 } },
      );
      setAiMsg(he
        ? `נוצרו ${r.scenesCreated} סצנות · ${r.framesCreated} מסגרות · סקר ${r.priorEpisodesReviewed} פרקים קודמים`
        : `Created ${r.scenesCreated} scenes · ${r.framesCreated} frames · reviewed ${r.priorEpisodesReviewed} prior episodes`);
      await load();
    } catch (e) {
      setAiMsg((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function load() {
    setEp(await api(`/api/v1/episodes/${id}`));
    setScenes(await api(`/api/v1/episodes/${id}/scenes`));
    setCosts(await api(`/api/v1/episodes/${id}/costs`).catch(() => null));
  }
  useEffect(() => { load(); }, [id]);

  async function createScene(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    await api(`/api/v1/episodes/${id}/scenes`, {
      method: "POST",
      body: { sceneNumber: Number((f.elements.namedItem("n") as HTMLInputElement).value), title: (f.elements.namedItem("t") as HTMLInputElement).value },
    });
    setCreating(false); load();
  }

  async function publish() {
    if (!confirm("Publish this episode to YouTube?")) return;
    await api(`/api/v1/episodes/${id}/publish/youtube`, { method: "POST" });
    load();
  }

  async function generateSEO() {
    await api(`/api/v1/episodes/${id}/seo/generate`, { method: "POST" });
    alert(he ? "ה-SEO נוצר מחדש" : "SEO regenerated");
  }
  async function saveField(field: "title" | "synopsis", value: string) {
    await api(`/api/v1/episodes/${id}`, { method: "PATCH", body: { [field]: value } });
    load();
  }
  const [editTitle, setEditTitle] = useState(false);
  const [editSyn, setEditSyn] = useState(false);

  if (!ep) return <div className="text-text-muted">Loading…</div>;

  return (
    <div translate="no" className="notranslate space-y-6">
      {ep.seasonId && (
        <Link href={`/seasons/${ep.seasonId}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">{lang === "he" ? "→ חזרה לעונה" : "← Back to season"}</Link>
      )}
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <div data-no-translate className="text-xs text-text-muted font-mono">EP{String(ep.episodeNumber).padStart(2, "0")}</div>
          {editTitle ? (
            <input autoFocus defaultValue={ep.title}
              onBlur={(e) => { setEditTitle(false); if (e.target.value !== ep.title) saveField("title", e.target.value || ep.title); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditTitle(false); }}
              className="text-3xl font-bold bg-bg-main rounded-lg px-2 py-1 w-full" />
          ) : (
            <h1 className="text-3xl font-bold group cursor-text" onClick={() => setEditTitle(true)} title={he ? "לחץ לעריכה" : "Click to edit"}>
              {ep.title}<span className="opacity-0 group-hover:opacity-50 text-base ms-2">✎</span>
            </h1>
          )}
          {editSyn ? (
            <textarea autoFocus defaultValue={ep.synopsis ?? ""} rows={3}
              onBlur={(e) => { setEditSyn(false); saveField("synopsis", e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Escape") setEditSyn(false); }}
              placeholder={he ? "סינופסיס הפרק" : "Episode synopsis"}
              className="w-full bg-bg-main rounded-lg px-3 py-2 text-sm mt-1" />
          ) : (
            <div className="mt-1 group">
              {ep.synopsis ? (
                <p className="text-text-secondary cursor-text inline" onClick={() => setEditSyn(true)}>{ep.synopsis}<span className="opacity-0 group-hover:opacity-50 text-xs ms-2">✎</span></p>
              ) : (
                <button onClick={() => setEditSyn(true)} className="text-xs text-text-muted hover:text-accent">+ {he ? "הוסף סינופסיס" : "Add synopsis"}</button>
              )}
            </div>
          )}
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap ${STATUS_COLOR[ep.status] ?? "bg-bg-main"}`}>{ep.status}</span>
      </div>

      {ep.characters && ep.characters.length > 0 && (
        <Card title="דמויות בפרק" subtitle={`${ep.characters.length} characters`}>
          <div className="flex gap-3 flex-wrap">
            {ep.characters.map((ec) => (
              <div key={ec.character.id} className="flex items-center gap-2 bg-bg-main rounded-full pe-3 ps-0.5 py-0.5">
                {ec.character.media[0] ? (
                  <img src={ec.character.media[0].fileUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bg-card flex items-center justify-center text-xs">🎭</div>
                )}
                <div className="text-sm">
                  <div className="font-medium">{ec.character.name}</div>
                  {ec.character.roleType && <div className="text-[10px] text-text-muted">{ec.character.roleType}</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <EpisodeMergedVideo episodeId={id} />

      <div className="flex gap-2 flex-wrap">
        <Link href={`/episodes/${id}/seo`} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">SEO</Link>
        <button onClick={generateSEO} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">Auto-generate SEO</button>
        <button onClick={publish} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold ml-auto">Publish to YouTube</button>
      </div>

      <div className="flex gap-1 border-b border-bg-main">
        <button
          onClick={() => setTab("scenes")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "scenes" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"}`}
        >
          {he ? "סצנות" : "Scenes"} <span className="text-text-muted">({scenes.length})</span>
        </button>
        <button
          onClick={() => setTab("costs")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === "costs" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"}`}
        >
          {he ? "עלויות" : "Costs"}{costs && costs.total > 0 && <span className="ms-1 text-text-muted num">· ${costs.total.toFixed(2)}</span>}
        </button>
      </div>

      {tab === "scenes" && (
        <div className="bg-bg-card rounded-card border border-bg-main p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div>
              <div className="text-lg font-bold">{he ? "סצנות" : "Scenes"} <span className="text-text-muted text-sm font-normal">· {scenes.length}</span></div>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={aiBusy} onClick={generateScenesAI} className="px-3 py-1.5 rounded-lg border-2 border-accent text-accent bg-white text-sm font-semibold hover:bg-accent hover:text-white transition-colors disabled:opacity-50">
                🤖 {aiBusy ? (he ? "יוצר סצנות…" : "Generating…") : (he ? "צור סצנות עם AI" : "Generate scenes with AI")}
              </button>
              <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ {he ? "סצנה" : "Scene"}</button>
            </div>
          </div>
          {aiMsg && (
            <div className={`text-sm mb-3 rounded-lg px-3 py-2 ${aiBusy ? "bg-bg-main text-text-secondary" : "bg-status-okBg text-status-okText"}`}>
              {aiMsg}
            </div>
          )}
          {creating && (
            <form onSubmit={createScene} className="bg-bg-main rounded-lg p-3 mb-3 flex gap-2">
              <input name="n" required type="number" min="1" defaultValue={scenes.length + 1} className="w-20 px-3 py-2 rounded-lg border border-bg-main bg-white" />
              <input name="t" required placeholder={he ? "כותרת סצנה" : "Scene title"} className="flex-1 px-3 py-2 rounded-lg border border-bg-main bg-white" />
              <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm">{he ? "הוסף" : "Add"}</button>
            </form>
          )}
          {scenes.length === 0 ? (
            <div className="text-center py-8 text-text-muted">{he ? "אין סצנות עדיין" : "No scenes yet."}</div>
          ) : (
            <ul className="space-y-1">
              {scenes.map((s) => (
                <li key={s.id}>
                  <Link href={`/scenes/${s.id}`} className="flex justify-between items-center bg-bg-main rounded-lg p-3 hover:bg-bg-main/60">
                    <div>
                      <span data-no-translate className="font-mono text-xs text-text-muted">SC{String(s.sceneNumber).padStart(2, "0")}</span>
                      <span className="ml-3 font-medium">{s.title ?? (he ? "ללא כותרת" : "Untitled")}</span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-bg-card text-text-secondary">{s.status}</span>
                      <span className="num">${s.actualCost.toFixed(2)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "costs" && (
        <div className="bg-bg-card rounded-card border border-bg-main p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="text-lg font-bold">{he ? "עלות הפרק" : "Episode cost"} <span className="text-text-muted text-sm font-normal">· {he ? "סה\"כ" : "Total"}: ${(costs?.total ?? 0).toFixed(4)}</span></div>
          </div>
          {!costs || costs.total === 0 ? (
            <div className="text-center py-8 text-text-muted">{he ? "אין עלויות מצטברות עדיין" : "No accumulated costs yet"}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-bg-main rounded-lg p-3">
                  <div className="text-[11px] text-text-muted">{he ? "רמת-הפרק" : "Episode-level"}</div>
                  <div className="font-bold num">${costs.breakdown.episode.toFixed(4)}</div>
                </div>
                <div className="bg-bg-main rounded-lg p-3">
                  <div className="text-[11px] text-text-muted">{he ? "סצנות" : "Scenes"}</div>
                  <div className="font-bold num">${costs.breakdown.scenes.toFixed(4)}</div>
                </div>
                <div className="bg-bg-main rounded-lg p-3">
                  <div className="text-[11px] text-text-muted">{he ? "פריימים · תמונות" : "Frames · images"}</div>
                  <div className="font-bold num">${costs.breakdown.frames.toFixed(4)}</div>
                </div>
                <div className="bg-bg-main rounded-lg p-3">
                  <div className="text-[11px] text-text-muted">{he ? "דמויות · גלריה" : "Characters · gallery"}</div>
                  <div className="font-bold num">${costs.breakdown.characterMedia.toFixed(4)}</div>
                </div>
              </div>
              {Object.keys(costs.byCategory).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {Object.entries(costs.byCategory).map(([cat, v]) => (
                    <span key={cat} className="px-2 py-1 rounded-full bg-bg-main">{cat}: <span className="num font-semibold">${v.toFixed(4)}</span></span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
