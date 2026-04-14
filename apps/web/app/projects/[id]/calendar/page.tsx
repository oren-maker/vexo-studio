"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Entry = { id: string; title: string; scheduledAt: string; platform: string; status: string; episodeId: string | null };

export default function CalendarPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Entry[]>([]);
  const [creating, setCreating] = useState(false);

  async function load() { setItems(await api<Entry[]>(`/api/v1/projects/${id}/calendar`).catch(() => [])); }
  useEffect(() => { load(); }, [id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    await api(`/api/v1/projects/${id}/calendar`, {
      method: "POST",
      body: {
        title: (f.elements.namedItem("title") as HTMLInputElement).value,
        scheduledAt: new Date((f.elements.namedItem("at") as HTMLInputElement).value).toISOString(),
        platform: (f.elements.namedItem("platform") as HTMLSelectElement).value,
      },
    });
    setCreating(false); load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Content Calendar</h1>
      <Card title="Scheduled" subtitle={`${items.length} entries`}>
        <div className="flex justify-end mb-4">
          <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ Schedule</button>
        </div>
        {creating && (
          <form onSubmit={add} className="bg-bg-main rounded-lg p-4 mb-4 grid grid-cols-3 gap-2">
            <input name="title" required placeholder="Title" className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <input name="at" required type="datetime-local" className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <select name="platform" className="px-3 py-2 rounded-lg border border-bg-main bg-white"><option>YOUTUBE</option><option>TIKTOK</option><option>VIMEO</option></select>
            <button className="col-span-3 px-4 py-2 rounded-lg bg-accent text-white text-sm">Schedule</button>
          </form>
        )}
        {items.length === 0 ? (
          <div className="text-center py-8 text-text-muted"><div className="text-3xl mb-2">📅</div><div>Nothing scheduled yet.</div></div>
        ) : (
          <ul className="space-y-2">
            {items.map((e) => (
              <li key={e.id} className="bg-bg-main rounded-lg p-3 flex justify-between items-center">
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-text-muted">{new Date(e.scheduledAt).toLocaleString()} · {e.platform}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-bg-card font-bold">{e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
