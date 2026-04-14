"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Character = { id: string; name: string; characterType: string | null; appearance: string | null; personality: string | null; continuityLock: boolean; media: { id: string }[]; voices: { id: string }[] };

export default function CharactersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [items, setItems] = useState<Character[]>([]);
  const [creating, setCreating] = useState(false);

  async function load() { setItems(await api<Character[]>(`/api/v1/projects/${projectId}/characters`).catch(() => [])); }
  useEffect(() => { load(); }, [projectId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    await api(`/api/v1/projects/${projectId}/characters`, {
      method: "POST",
      body: {
        name: (f.elements.namedItem("name") as HTMLInputElement).value,
        characterType: (f.elements.namedItem("type") as HTMLSelectElement).value,
        appearance: (f.elements.namedItem("appearance") as HTMLInputElement).value,
      },
    });
    setCreating(false); load();
  }

  async function generateGallery(charId: string) {
    await api(`/api/v1/characters/${charId}/generate-gallery`, { method: "POST" });
    alert("Gallery generation queued.");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Character Studio</h1>
      <Card title="Cast" subtitle={`${items.length} characters`}>
        <div className="flex justify-end mb-4">
          <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ Character</button>
        </div>
        {creating && (
          <form onSubmit={create} className="bg-bg-main rounded-lg p-4 mb-4 grid grid-cols-3 gap-2">
            <input name="name" required placeholder="Name" className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <select name="type" className="px-3 py-2 rounded-lg border border-bg-main bg-white"><option>HUMAN</option><option>ANIMATED</option><option>NARRATOR</option></select>
            <input name="appearance" placeholder="Appearance" className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <button className="col-span-3 px-4 py-2 rounded-lg bg-accent text-white text-sm">Add character</button>
          </form>
        )}
        {items.length === 0 ? (
          <div className="text-center py-8 text-text-muted">No characters yet.</div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((c) => (
              <li key={c.id} className="bg-bg-main rounded-card p-4">
                <div className="flex justify-between mb-1">
                  <div className="font-semibold">{c.name}</div>
                  {c.continuityLock && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">🔒 LOCKED</span>}
                </div>
                <div className="text-xs text-text-muted mb-2">{c.characterType ?? "—"}</div>
                {c.appearance && <div className="text-xs text-text-secondary line-clamp-2">{c.appearance}</div>}
                <div className="flex justify-between items-center mt-3 text-xs">
                  <span className="text-text-muted">{c.media.length} images · {c.voices.length} voices</span>
                  <button onClick={() => generateGallery(c.id)} className="text-accent hover:underline">Generate gallery</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
