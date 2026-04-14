"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type SEO = { seoTitle: string | null; seoDescription: string | null; seoTags: string[] | null };

export default function SeoPage() {
  const { id } = useParams<{ id: string }>();
  const [seo, setSeo] = useState<SEO>({ seoTitle: null, seoDescription: null, seoTags: null });
  const [busy, setBusy] = useState(false);

  async function load() { setSeo(await api<SEO>(`/api/v1/episodes/${id}/seo`).catch(() => ({ seoTitle: null, seoDescription: null, seoTags: null }))); }
  useEffect(() => { load(); }, [id]);

  async function regenerate() {
    setBusy(true);
    try { await api(`/api/v1/episodes/${id}/seo/generate`, { method: "POST" }); await load(); }
    finally { setBusy(false); }
  }

  async function save() {
    await api(`/api/v1/episodes/${id}/seo`, { method: "PATCH", body: seo });
    alert("Saved");
  }

  return (
    <Card title="SEO Optimizer" subtitle="Title, description and tags for video platforms">
      <button disabled={busy} onClick={regenerate} className="mb-4 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">{busy ? "Generating…" : "Auto-generate with AI"}</button>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input value={seo.seoTitle ?? ""} onChange={(e) => setSeo({ ...seo, seoTitle: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-bg-main" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea rows={5} value={seo.seoDescription ?? ""} onChange={(e) => setSeo({ ...seo, seoDescription: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-bg-main" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
          <input value={(seo.seoTags ?? []).join(", ")} onChange={(e) => setSeo({ ...seo, seoTags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="w-full px-3 py-2 rounded-lg border border-bg-main" />
        </div>
        <button onClick={save} className="px-4 py-2 rounded-lg bg-accent text-white font-semibold">Save</button>
      </div>
    </Card>
  );
}
