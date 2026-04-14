"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
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
  const he = lang === "he";

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
    alert("SEO regenerated");
  }

  if (!ep) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      {ep.seasonId && (
        <Link href={`/seasons/${ep.seasonId}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">{lang === "he" ? "→ חזרה לעונה" : "← Back to season"}</Link>
      )}
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-text-muted font-mono">EP{String(ep.episodeNumber).padStart(2, "0")}</div>
          <h1 className="text-3xl font-bold">{ep.title}</h1>
          {ep.synopsis && <p className="text-text-secondary mt-1">{ep.synopsis}</p>}
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-bold ${STATUS_COLOR[ep.status] ?? "bg-bg-main"}`}>{ep.status}</span>
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

      <div className="flex gap-2 flex-wrap">
        <Link href={`/episodes/${id}/seo`} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">SEO</Link>
        <Link href={`/episodes/${id}/thumbnails`} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">Thumbnails</Link>
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
            <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ {he ? "סצנה" : "Scene"}</button>
          </div>
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
