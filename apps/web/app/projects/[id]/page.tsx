"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Series = { id: string; title: string; summary: string | null; actualCost: number; revenueTotal: number };
type Project = {
  id: string; name: string; description: string | null; status: string; contentType: string;
  genreTag: string | null; series: Series[];
  aiDirector: { mode: string; autopilotEnabled: boolean } | null;
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  async function load() { setProject(await api<Project>(`/api/v1/projects/${id}`).catch(() => null)); }
  useEffect(() => { load(); }, [id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api(`/api/v1/projects/${id}/series`, { method: "POST", body: { title } });
    setTitle(""); setCreating(false); load();
  }

  if (!project) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-text-muted">{project.contentType.replace("_", " ")}{project.genreTag && ` · ${project.genreTag}`}</div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          {project.description && <p className="text-text-secondary mt-1">{project.description}</p>}
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-bg-main font-bold">{project.status}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Link href={`/projects/${id}/finance`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">💰 Finance</Link>
        <Link href={`/projects/${id}/distribution`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">📡 Distribution</Link>
        <Link href={`/projects/${id}/analytics`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">📊 Analytics</Link>
        <Link href={`/projects/${id}/calendar`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">📅 Calendar</Link>
        <Link href={`/projects/${id}/ai-director`} className="bg-bg-card rounded-card border border-bg-main p-4 hover:border-accent text-sm">🤖 AI Director</Link>
      </div>

      <Card title="Series" subtitle="The shows / arcs in this project">
        <div className="flex justify-between mb-4">
          <span className="text-xs text-text-muted">{project.series.length} series</span>
          <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ New series</button>
        </div>
        {creating && (
          <form onSubmit={create} className="bg-bg-main rounded-lg p-4 mb-4 flex gap-2">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Series title" className="flex-1 px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">Cancel</button>
          </form>
        )}
        {project.series.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <div className="text-3xl mb-2">📺</div>
            <div>No series yet — create one to start adding seasons & episodes.</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {project.series.map((s) => (
              <li key={s.id}>
                <Link href={`/series/${s.id}`} className="block bg-bg-main rounded-lg p-4 hover:bg-bg-main/60">
                  <div className="flex justify-between">
                    <div>
                      <div className="font-semibold">{s.title}</div>
                      {s.summary && <div className="text-xs text-text-secondary">{s.summary}</div>}
                    </div>
                    <div className="text-right text-xs">
                      <div className="num text-status-errText">cost ${s.actualCost.toFixed(2)}</div>
                      <div className="num text-status-okText">rev ${s.revenueTotal.toFixed(2)}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
