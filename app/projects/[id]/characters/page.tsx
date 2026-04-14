"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";

type Media = { id: string; fileUrl: string; metadata?: { angle?: string } };
type Character = {
  id: string; name: string; roleType: string | null; gender: string | null; ageRange: string | null;
  appearance: string | null; personality: string | null; wardrobeRules: string | null;
  media: Media[];
};

export default function CharactersPage() {
  const { id } = useParams<{ id: string }>();
  const lang = useLang();
  const [chars, setChars] = useState<Character[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [populateBusy, setPopulateBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    const r = await api<Character[]>(`/api/v1/projects/${id}/characters`).catch(() => [] as Character[]);
    setChars(r);
  }
  useEffect(() => { load(); }, [id]);

  async function saveNew(e: React.FormEvent) {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const get = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement)?.value || undefined;
    await api(`/api/v1/projects/${id}/characters`, {
      method: "POST",
      body: {
        name: get("name"),
        roleType: get("roleType"),
        gender: get("gender"),
        ageRange: get("ageRange"),
        appearance: get("appearance"),
        personality: get("personality"),
        wardrobeRules: get("wardrobeRules"),
      },
    });
    setCreating(false);
    load();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const f = e.currentTarget as HTMLFormElement;
    const get = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement)?.value || undefined;
    await api(`/api/v1/characters/${editing.id}`, {
      method: "PATCH",
      body: {
        name: get("name"), roleType: get("roleType"),
        appearance: get("appearance"), personality: get("personality"),
      },
    });
    setEditing(null);
    load();
  }

  async function generateGallery(cid: string) {
    if (!confirm(lang === "he" ? "ליצור 5 תמונות בזוויות שונות לדמות? (עולה ~$0.20)" : "Generate 5 angle images for this character? (~$0.20)")) return;
    setGenBusy(cid);
    try {
      const r = await api<{ generated: number; errors: { angle: string; error: string }[] }>(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST" });
      if (r.errors.length) alert((lang === "he" ? "נוצרו " : "Generated ") + r.generated + "/5" + (lang === "he" ? "\nשגיאות: " : "\nErrors: ") + r.errors.map((e) => e.angle).join(", "));
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setGenBusy(null); }
  }

  async function autoPopulate() {
    if (!confirm(lang === "he" ? "לזהות דמויות ראשיות אוטומטית מכל הפרקים? קיימות לא יימחקו." : "Auto-detect main characters from all episodes? Existing ones are preserved.")) return;
    setPopulateBusy(true);
    try {
      const r = await api<{ totalCharacters: number; newlyCreated: number; skipped: string[] }>(`/api/v1/projects/${id}/characters/auto-populate`, { method: "POST" });
      alert((lang === "he" ? `זוהו ${r.totalCharacters} דמויות. חדשות: ${r.newlyCreated}. קיימות שנשמרו: ${r.skipped.length}` : `Found ${r.totalCharacters} characters. New: ${r.newlyCreated}. Preserved: ${r.skipped.length}`));
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setPopulateBusy(false); }
  }

  async function generateAll() {
    const missing = chars.filter((c) => c.media.length === 0).length;
    if (missing === 0) return alert(lang === "he" ? "לכל הדמויות כבר יש תמונות" : "All characters already have images");
    const est = (missing * 5 * 0.039).toFixed(2);
    if (!confirm(lang === "he" ? `לייצר 5 תמונות לכל ${missing} דמויות חסרות גלריה? עלות משוערת: $${est}` : `Generate 5 images for ${missing} characters missing galleries? Estimated: $${est}`)) return;
    setBulkBusy(true);
    try {
      let remaining = missing;
      while (remaining > 0) {
        const r = await api<{ totalGenerated: number; pending: number }>(`/api/v1/projects/${id}/characters/generate-all-galleries`, { method: "POST" });
        remaining = r.pending;
        if (r.totalGenerated === 0 && r.pending === 0) break;
        await load();
      }
      alert(lang === "he" ? "סיימנו לייצר תמונות לכל הדמויות" : "Finished generating images for all characters");
    } catch (e) { alert((e as Error).message); }
    finally { setBulkBusy(false); }
  }

  async function del(cid: string) {
    if (!confirm(lang === "he" ? "למחוק דמות זו ואת כל התמונות שלה?" : "Delete this character and all its images?")) return;
    await api(`/api/v1/characters/${cid}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <Card title={lang === "he" ? "דמויות" : "Characters"} subtitle={lang === "he" ? "דמויות ראשיות חוזרות בסדרה — כל דמות יכולה להיות עם 5 תמונות בזוויות שונות" : "Recurring main characters in this project — each can have 5 angle images"}>
        <div className="flex justify-end gap-2 mb-3 flex-wrap">
          <button disabled={populateBusy} onClick={autoPopulate} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
            {populateBusy ? (lang === "he" ? "מזהה…" : "Detecting…") : (lang === "he" ? "🪄 זהה מהפרקים" : "🪄 Detect from episodes")}
          </button>
          <button disabled={bulkBusy || chars.length === 0} onClick={generateAll} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
            {bulkBusy ? (lang === "he" ? "מייצר תמונות…" : "Generating…") : (lang === "he" ? "✨ תמונות לכל הדמויות" : "✨ Gallery for all")}
          </button>
          <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ {lang === "he" ? "דמות חדשה" : "New character"}</button>
        </div>

        {creating && (
          <form onSubmit={saveNew} className="bg-bg-main rounded-lg p-4 mb-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input name="name" required placeholder={lang === "he" ? "שם *" : "Name *"} className="px-3 py-2 rounded-lg bg-white border border-bg-main" />
              <input name="roleType" placeholder={lang === "he" ? "תפקיד (ראשי/משני...)" : "Role (lead/support...)"} className="px-3 py-2 rounded-lg bg-white border border-bg-main" />
              <input name="gender" placeholder={lang === "he" ? "מגדר" : "Gender"} className="px-3 py-2 rounded-lg bg-white border border-bg-main" />
              <input name="ageRange" placeholder={lang === "he" ? "טווח גיל" : "Age range"} className="px-3 py-2 rounded-lg bg-white border border-bg-main" />
            </div>
            <textarea name="appearance" placeholder={lang === "he" ? "מראה פיזי (חשוב לייצור תמונות עקביות)" : "Physical appearance (important for consistent image generation)"} className="w-full px-3 py-2 rounded-lg bg-white border border-bg-main" rows={3} />
            <textarea name="personality" placeholder={lang === "he" ? "אופי ורקע" : "Personality & background"} className="w-full px-3 py-2 rounded-lg bg-white border border-bg-main" rows={2} />
            <textarea name="wardrobeRules" placeholder={lang === "he" ? "כללי תלבושת (מה הדמות לובשת)" : "Wardrobe rules (what the character wears)"} className="w-full px-3 py-2 rounded-lg bg-white border border-bg-main" rows={2} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">{lang === "he" ? "בטל" : "Cancel"}</button>
              <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm">{lang === "he" ? "שמור" : "Save"}</button>
            </div>
          </form>
        )}

        {chars.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <div className="text-3xl mb-2">🎭</div>
            <div>{lang === "he" ? "עדיין אין דמויות" : "No characters yet"}</div>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {chars.map((c) => (
              <li key={c.id} className="bg-bg-main rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-text-muted">{[c.roleType, c.gender, c.ageRange].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(c)} className="text-xs px-2 py-1 rounded border border-bg-card">{lang === "he" ? "ערוך" : "Edit"}</button>
                    <button onClick={() => del(c.id)} className="text-xs px-2 py-1 rounded border border-status-errText text-status-errText">{lang === "he" ? "מחק" : "Delete"}</button>
                  </div>
                </div>

                {c.appearance && <div className="text-xs text-text-secondary line-clamp-3">{c.appearance}</div>}

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold">{lang === "he" ? "גלריה" : "Gallery"} ({c.media.length}/5)</span>
                    <button
                      disabled={genBusy === c.id}
                      onClick={() => generateGallery(c.id)}
                      className="text-xs px-2 py-1 rounded-lg border border-accent text-accent disabled:opacity-50"
                    >
                      {genBusy === c.id ? (lang === "he" ? "מייצר…" : "Generating…") : (lang === "he" ? "✨ ייצר 5 תמונות" : "✨ Generate 5 images")}
                    </button>
                  </div>
                  {c.media.length === 0 ? (
                    <div className="text-xs text-text-muted text-center py-4 bg-bg-card rounded-lg">{lang === "he" ? "אין תמונות עדיין" : "No images yet"}</div>
                  ) : (
                    <div className="grid grid-cols-5 gap-1">
                      {c.media.slice(0, 5).map((m) => (
                        <div key={m.id} className="aspect-square rounded overflow-hidden bg-bg-card">
                          <img src={m.fileUrl} alt={m.metadata?.angle ?? ""} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={saveEdit} className="bg-bg-card rounded-card p-5 w-full max-w-lg space-y-2">
            <h3 className="font-bold">{lang === "he" ? "עריכת דמות" : "Edit character"}</h3>
            <input name="name" defaultValue={editing.name} required className="w-full px-3 py-2 rounded-lg bg-white border border-bg-main" />
            <input name="roleType" defaultValue={editing.roleType ?? ""} placeholder={lang === "he" ? "תפקיד" : "Role"} className="w-full px-3 py-2 rounded-lg bg-white border border-bg-main" />
            <textarea name="appearance" defaultValue={editing.appearance ?? ""} placeholder={lang === "he" ? "מראה" : "Appearance"} className="w-full px-3 py-2 rounded-lg bg-white border border-bg-main" rows={3} />
            <textarea name="personality" defaultValue={editing.personality ?? ""} placeholder={lang === "he" ? "אופי" : "Personality"} className="w-full px-3 py-2 rounded-lg bg-white border border-bg-main" rows={2} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-bg-main text-sm">{lang === "he" ? "בטל" : "Cancel"}</button>
              <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm">{lang === "he" ? "שמור" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
