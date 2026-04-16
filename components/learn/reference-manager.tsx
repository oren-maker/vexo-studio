"use client";

import { learnFetch } from "@/lib/learn/fetch";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  kind: "emotion" | "sound";
  name: string;
  shortDesc: string;
  longDesc: string;
  tags: string[];
  order: number;
};

export default function ReferenceManager({ kind }: { kind: "emotion" | "sound" }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const r = await learnFetch(`/api/v1/learn/reference?kind=${kind}`).then((r) => r.json());
      setItems(r.items ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [kind]);

  async function onDelete(id: string) {
    if (!confirm("למחוק פריט זה?")) return;
    await learnFetch(`/api/v1/learn/reference/${id}`, { method: "DELETE" });
    load();
  }

  const emptyText = kind === "emotion" ? "אין רגשות. לחץ '➕ הוסף' כדי להתחיל." : "אין סאונדים. לחץ '➕ הוסף' כדי להתחיל.";
  const addLabel = kind === "emotion" ? "➕ הוסף רגש" : "➕ הוסף סאונד";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-slate-500">
          {loading ? "טוען…" : `${items.length} פריטים`}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-4 py-1.5 rounded-lg text-xs"
        >
          {addLabel}
        </button>
      </div>

      {!loading && items.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
          {emptyText}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((it) => {
          const isOpen = expanded[it.id];
          return (
            <div key={it.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-base font-bold text-white">{it.name}</div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditing(it)} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded">✏️</button>
                  <button onClick={() => onDelete(it.id)} className="text-xs bg-slate-800 hover:bg-red-500/40 text-slate-300 px-2 py-1 rounded">🗑</button>
                </div>
              </div>
              <div className="text-sm text-slate-300 mb-2">{it.shortDesc}</div>
              {isOpen && (
                <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap mb-2 bg-slate-950/40 p-3 rounded">{it.longDesc}</div>
              )}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setExpanded({ ...expanded, [it.id]: !isOpen })}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300"
                >
                  {isOpen ? "▲ הסתר" : "▼ הרחב"}
                </button>
                {it.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {it.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <EditModal
          kind={kind}
          initial={editing || undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditModal({
  kind,
  initial,
  onClose,
  onSaved,
}: {
  kind: "emotion" | "sound";
  initial?: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [shortDesc, setShortDesc] = useState(initial?.shortDesc ?? "");
  const [longDesc, setLongDesc] = useState(initial?.longDesc ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = {
        kind,
        name,
        shortDesc,
        longDesc,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      const url = initial ? `/api/v1/learn/reference/${initial.id}` : "/api/v1/learn/reference";
      const method = initial ? "PATCH" : "POST";
      const r = await learnFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "שגיאה");
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-2xl w-full mt-10 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">
            {initial ? `ערוך ${kind === "emotion" ? "רגש" : "סאונד"}` : `${kind === "emotion" ? "רגש" : "סאונד"} חדש`}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">שם *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">תיאור קצר (שורה — נכנס לפרומפט של הבמאי) *</label>
          <input
            value={shortDesc}
            onChange={(e) => setShortDesc(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">תיאור מורחב *</label>
          <textarea
            value={longDesc}
            onChange={(e) => setLongDesc(e.target.value)}
            rows={7}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">תגיות (מופרדות בפסיק)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white"
          />
        </div>

        {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-2 text-xs">{err}</div>}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded text-sm">
            ביטול
          </button>
          <button
            onClick={save}
            disabled={busy || !name || !shortDesc || !longDesc}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {busy ? "שומר…" : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}
