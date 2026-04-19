"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import SeriesLogButton from "@/components/series-log-button";

type Series = { id: string; title: string; summary: string | null; actualCost: number; revenueTotal: number; profitTotal: number; budgetStatus: string };
type Season = { id: string; seasonNumber: number; title: string | null; totalEpisodes: number; status: string };
type Episode = { id: string; episodeNumber: number; title: string; status: string; actualCost: number; revenueTotal: number };

export default function SeriesPage() {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [openSeason, setOpenSeason] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [creatingSeason, setCreatingSeason] = useState(false);

  async function load() {
    setSeries(await api<Series>(`/api/v1/series/${id}`));
    const seas = await api<Season[]>(`/api/v1/series/${id}/seasons`);
    setSeasons(seas);
    if (seas.length > 0 && !openSeason) {
      setOpenSeason(seas[0].id);
      loadEpisodes(seas[0].id);
    }
  }
  async function loadEpisodes(seasonId: string) {
    setEpisodes(await api<Episode[]>(`/api/v1/seasons/${seasonId}/episodes`));
  }
  useEffect(() => { load(); }, [id]);

  async function createSeason(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const num = (f.elements.namedItem("seasonNumber") as HTMLInputElement).value;
    const t = (f.elements.namedItem("title") as HTMLInputElement).value;
    await api(`/api/v1/series/${id}/seasons`, { method: "POST", body: { seasonNumber: Number(num), title: t } });
    setCreatingSeason(false); load();
  }

  async function createEpisode(seasonId: string, num: number, title: string) {
    await api(`/api/v1/seasons/${seasonId}/episodes`, { method: "POST", body: { episodeNumber: num, title } });
    loadEpisodes(seasonId);
  }

  if (!series) return <div className="text-text-muted">Loading…</div>;

  const profit = series.revenueTotal - series.actualCost;
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">{series.title}</h1>
          <SeriesLogButton seriesId={series.id} />
        </div>
        {series.summary ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-text-muted hover:text-accent">
              📝 סיכום עלילתי ({series.summary.length} תווים) · לחץ להרחבה
            </summary>
            <div className="mt-2 p-3 bg-bg-card rounded-lg border border-bg-main text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
              {series.summary}
            </div>
          </details>
        ) : (
          <button
            onClick={async () => {
              if (!confirm("Gemini יכתוב סיכום 3-פסקאות מהפרקים. עלות ~$0.02. להמשיך?")) return;
              try {
                await api(`/api/v1/series/${id}/auto-summary`, { method: "POST" });
                window.location.reload();
              } catch (e) { alert((e as Error).message); }
            }}
            className="mt-1 text-sm text-accent hover:underline"
          >
            ✨ ייצר סיכום עלילתי אוטומטי
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Cost</div><div className="num text-2xl font-bold" style={{ color: "#e03a4e" }}>${series.actualCost.toFixed(2)}</div></div>
        <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Revenue</div><div className="num text-2xl font-bold" style={{ color: "#1db868" }}>${series.revenueTotal.toFixed(2)}</div></div>
        <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Net profit</div><div className="num text-2xl font-bold" style={{ color: profit >= 0 ? "#1db868" : "#e03a4e" }}>${profit.toFixed(2)}</div></div>
        <div className="bg-bg-card rounded-card border border-bg-main p-4"><div className="text-xs text-text-muted uppercase">Budget</div><div className="text-lg font-bold">{series.budgetStatus}</div></div>
      </div>

      <Card title="Seasons" subtitle={`${seasons.length} seasons`}>
        <div className="flex justify-end mb-3">
          <button onClick={() => setCreatingSeason(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ Season</button>
        </div>
        {creatingSeason && (
          <form onSubmit={createSeason} className="bg-bg-main rounded-lg p-4 mb-4 flex gap-2">
            <input name="seasonNumber" required type="number" min="1" defaultValue={seasons.length + 1} className="w-20 px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <input name="title" placeholder="Optional title" className="flex-1 px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm">Create</button>
            <button type="button" onClick={() => setCreatingSeason(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">Cancel</button>
          </form>
        )}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {seasons.map((s) => (
            <button key={s.id} onClick={() => { setOpenSeason(s.id); loadEpisodes(s.id); }} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${openSeason === s.id ? "bg-accent text-white" : "bg-bg-main text-text-secondary"}`}>
              S{s.seasonNumber}{s.title && ` · ${s.title}`}
            </button>
          ))}
        </div>
        {openSeason && (
          <EpisodeList seasonId={openSeason} episodes={episodes} onCreate={createEpisode} />
        )}
      </Card>
    </div>
  );
}

function EpisodeList({ seasonId, episodes, onCreate }: { seasonId: string; episodes: Episode[]; onCreate: (sid: string, n: number, t: string) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <div className="flex justify-between mb-3">
        <span className="text-xs text-text-muted">{episodes.length} episodes</span>
        <button onClick={() => setCreating(true)} className="text-sm text-accent">+ Episode</button>
      </div>
      {creating && (
        <form onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget as HTMLFormElement; await onCreate(seasonId, Number((f.elements.namedItem("n") as HTMLInputElement).value), (f.elements.namedItem("t") as HTMLInputElement).value); setCreating(false); }} className="bg-bg-main rounded-lg p-3 mb-3 flex gap-2">
          <input name="n" required type="number" min="1" defaultValue={episodes.length + 1} className="w-20 px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <input name="t" required placeholder="Episode title" className="flex-1 px-3 py-2 rounded-lg border border-bg-main bg-white" />
          <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm">Add</button>
        </form>
      )}
      <ul className="space-y-1">
        {episodes.map((ep) => (
          <li key={ep.id}>
            <Link href={`/episodes/${ep.id}`} className="flex justify-between items-center bg-bg-main rounded-lg p-3 hover:bg-bg-main/60">
              <div>
                <span className="font-mono text-xs text-text-muted">EP{String(ep.episodeNumber).padStart(2, "0")}</span>
                <span className="ml-3 font-medium">{ep.title}</span>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-bg-card text-text-secondary">{ep.status}</span>
                <span className="num">${ep.actualCost.toFixed(2)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
