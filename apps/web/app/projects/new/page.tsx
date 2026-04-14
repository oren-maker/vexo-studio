"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", contentType: "SERIES" as "SERIES" | "COURSE" | "KIDS_CONTENT",
    description: "", language: "he", targetAudience: "", genreTag: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const project = await api<{ id: string }>("/api/v1/projects", { method: "POST", body: form });
      router.push(`/projects/${project.id}`);
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">New Project</h1>
      <form onSubmit={submit} className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-bg-main" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Content type</label>
            <select value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value as never })} className="w-full px-3 py-2 rounded-lg border border-bg-main">
              <option value="SERIES">TV Series</option>
              <option value="COURSE">Training Course</option>
              <option value="KIDS_CONTENT">Kids Content</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Language</label>
            <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-bg-main">
              <option value="he">Hebrew</option>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="es">Spanish</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-bg-main" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Target audience</label>
            <input value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-bg-main" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Genre</label>
            <input value={form.genreTag} onChange={(e) => setForm({ ...form, genreTag: e.target.value })} placeholder="DRAMA, COMEDY, …" className="w-full px-3 py-2 rounded-lg border border-bg-main" />
          </div>
        </div>
        {err && <div className="text-status-errText text-sm">{err}</div>}
        <button disabled={busy} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Creating…" : "Create project"}</button>
      </form>
    </div>
  );
}
