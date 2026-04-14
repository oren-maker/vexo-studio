"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Template = { id: string; name: string; contentType: string; description: string | null; isPublic: boolean; isPremium: boolean; price: number | null; usageCount: number };

export default function TemplatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Template[]>([]);
  useEffect(() => { api<Template[]>("/api/v1/templates").then(setItems).catch(() => {}); }, []);

  async function apply(id: string) {
    const name = prompt("Project name?");
    if (!name) return;
    const p = await api<{ id: string }>(`/api/v1/templates/${id}/apply`, { method: "POST", body: { projectName: name } });
    router.push(`/projects/${p.id}`);
  }

  return (
    <Card title="Templates" subtitle="Your saved templates + public marketplace">
      {items.length === 0 ? (
        <div className="text-center py-12 text-text-muted"><div className="text-3xl mb-2">🧩</div><div>No templates yet.</div></div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t) => (
            <li key={t.id} className="bg-bg-main rounded-card p-4">
              <div className="flex justify-between mb-1">
                <div className="font-semibold">{t.name}</div>
                {t.isPremium && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent">PREMIUM</span>}
              </div>
              <div className="text-xs text-text-muted mb-2">{t.contentType.replace("_", " ")} · used {t.usageCount} times</div>
              {t.description && <div className="text-sm text-text-secondary line-clamp-3">{t.description}</div>}
              <button onClick={() => apply(t.id)} className="mt-3 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold">Use template</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
