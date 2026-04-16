"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";

type Media = { id: string; fileUrl: string; cost?: number; createdAt?: string; mediaType?: string; metadata?: { angle?: string; provider?: string; prompt?: string } };
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

  async function generateOne(cid: string) {
    setGenBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: { count: 1 } });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setGenBusy(null); }
  }

  async function generateRest(cid: string) {
    setGenBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: { count: "rest" } });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setGenBusy(null); }
  }

  async function buildComposite(cid: string) {
    setGenBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/composite`, { method: "POST", body: {} });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setGenBusy(null); }
  }

  async function regenerateAll(cid: string, name: string) {
    if (!confirm(lang === "he"
      ? `למחוק את כל התמונות של ${name} ולייצר 5 חדשות עם זהות נעולה? (~$0.20)`
      : `Delete all images for ${name} and generate 5 new ones with locked identity? (~$0.20)`)) return;
    setGenBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: { count: "rest", regenerate: true } });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setGenBusy(null); }
  }

  const [lightbox, setLightbox] = useState<{ character: Character; index: number } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const gallery = lightbox.character.media;
        if (gallery.length < 2) return;
        const delta = e.key === "ArrowRight" ? (lang === "he" ? -1 : 1) : (lang === "he" ? 1 : -1);
        const next = (lightbox.index + delta + gallery.length) % gallery.length;
        setLightbox({ character: lightbox.character, index: next });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, lang]);

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
      <div className="bg-bg-card rounded-card border border-bg-main p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-lg font-bold">{lang === "he" ? "דמויות" : "Characters"} <span className="text-text-muted text-sm font-normal">· {chars.length}</span></div>
            <div className="text-xs text-text-muted">{lang === "he" ? "ראשיות חוזרות · 5 תמונות בזוויות לכל דמות" : "Recurring main · 5 angle images per character"}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button disabled={populateBusy} onClick={autoPopulate} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
              {populateBusy ? (lang === "he" ? "מזהה…" : "Detecting…") : (lang === "he" ? "🪄 זהה מהפרקים" : "🪄 Detect from episodes")}
            </button>
            <button disabled={bulkBusy || chars.length === 0} onClick={generateAll} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
              {bulkBusy ? (lang === "he" ? "מייצר תמונות…" : "Generating…") : (lang === "he" ? "✨ תמונות לכל הדמויות" : "✨ Gallery for all")}
            </button>
            <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ {lang === "he" ? "דמות חדשה" : "New character"}</button>
          </div>
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
                  <Link href={`/characters/${c.id}`} className="flex-1 min-w-0 hover:underline">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-text-muted">{[c.roleType, c.gender, c.ageRange].filter(Boolean).join(" · ")}</div>
                  </Link>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(c)} className="text-xs px-2 py-1 rounded border border-bg-card">{lang === "he" ? "ערוך" : "Edit"}</button>
                    <button onClick={() => del(c.id)} className="text-xs px-2 py-1 rounded border border-status-errText text-status-errText">{lang === "he" ? "מחק" : "Delete"}</button>
                  </div>
                </div>

                {c.appearance && <div className="text-xs text-text-secondary line-clamp-3">{c.appearance}</div>}

                <div>
                  <div className="flex justify-between items-center mb-2 gap-2">
                    <span className="text-xs font-semibold">{lang === "he" ? "גלריה" : "Gallery"} ({c.media.length}/5) · <span className="num text-text-muted">${c.media.reduce((s, m) => s + (m.cost ?? 0), 0).toFixed(3)}</span></span>
                    <div className="flex gap-1">
                      {c.media.length === 0 && (
                        <button disabled={genBusy === c.id} onClick={() => generateOne(c.id)} className="text-xs px-2 py-1 rounded-lg bg-accent text-white disabled:opacity-50">
                          {genBusy === c.id ? (lang === "he" ? "מייצר…" : "…") : (lang === "he" ? "✨ תמונה ראשונה" : "✨ First image")}
                        </button>
                      )}
                      {c.media.length > 0 && c.media.length < 5 && (
                        <button disabled={genBusy === c.id} onClick={() => generateRest(c.id)} className="text-xs px-2 py-1 rounded-lg border border-accent text-accent disabled:opacity-50">
                          {genBusy === c.id ? (lang === "he" ? "מייצר…" : "…") : (lang === "he" ? `✨ השאר (${5 - c.media.length})` : `✨ Rest (${5 - c.media.length})`)}
                        </button>
                      )}
                      {c.media.length > 0 && (
                        <button disabled={genBusy === c.id} onClick={() => regenerateAll(c.id, c.name)} className="text-xs px-2 py-1 rounded-lg border border-status-errText text-status-errText disabled:opacity-50" title={lang === "he" ? "מוחק הכל ומייצר 5 חדשות עם זהות נעולה" : "Wipe + regenerate all 5 with locked identity"}>
                          {genBusy === c.id ? (lang === "he" ? "מייצר…" : "…") : (lang === "he" ? "🔄 ייצר מחדש" : "🔄 Regenerate")}
                        </button>
                      )}
                    </div>
                  </div>
                  {c.media.length === 0 ? (
                    <div className="text-xs text-text-muted text-center py-4 bg-bg-card rounded-lg">{lang === "he" ? "אין תמונות עדיין" : "No images yet"}</div>
                  ) : (() => {
                    const composite = c.media.find((x) => x.metadata?.angle === "composite");
                    if (composite) {
                      // Composite reference sheet — single image, all angles, with rebuild button.
                      return (
                        <div className="bg-[#121216] rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-white text-[11px] uppercase tracking-widest font-bold">{lang === "he" ? "🎨 רפרנס מאוחד" : "🎨 Composite reference"}</div>
                            <button
                              onClick={() => buildComposite(c.id)}
                              disabled={genBusy === c.id}
                              className="text-[10px] px-2 py-0.5 rounded border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50"
                            >
                              {genBusy === c.id ? "…" : (lang === "he" ? "🔁 בנה מחדש" : "🔁 Rebuild")}
                            </button>
                          </div>
                          <button
                            onClick={() => setLightbox({ character: c, index: c.media.indexOf(composite) })}
                            className="block w-full rounded overflow-hidden bg-bg-card group"
                          >
                            <img src={composite.fileUrl} alt={`${c.name} composite`} className="w-full h-auto object-contain group-hover:scale-[1.02] transition-transform" />
                          </button>
                          <div className="text-center">
                            <span className="text-accent text-sm font-bold">{c.name}</span>
                            {c.roleType && <span className="text-text-muted text-xs ms-2">— {c.roleType}</span>}
                          </div>
                          <details className="text-[10px] text-text-muted">
                            <summary className="cursor-pointer">{lang === "he" ? `📐 ${c.media.length - 1} זוויות מקור` : `📐 ${c.media.length - 1} source angles`}</summary>
                            <div className="grid grid-cols-5 gap-1 mt-2">
                              {c.media.filter((m) => m.metadata?.angle !== "composite").map((m, i) => (
                                <button key={m.id} onClick={() => setLightbox({ character: c, index: c.media.indexOf(m) })} className="relative aspect-square rounded overflow-hidden bg-bg-card">
                                  <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          </details>
                        </div>
                      );
                    }
                    // No composite yet — show a CTA + the legacy 5-cell grid below.
                    return (
                      <div className="bg-[#121216] rounded-lg p-3 space-y-2">
                        <button
                          onClick={() => buildComposite(c.id)}
                          disabled={genBusy === c.id}
                          className="w-full py-2 rounded bg-accent/10 hover:bg-accent/20 border border-accent/40 text-accent text-xs font-semibold disabled:opacity-50"
                        >
                          {genBusy === c.id ? "🔄 בונה…" : (lang === "he" ? "🎨 בנה תמונת רפרנס מאוחדת (לסורה/VEO)" : "🎨 Build composite reference (for Sora/VEO)")}
                        </button>
                        <div className="grid grid-cols-3 gap-1.5">
                          {["front","three-quarter","profile"].map((angle) => {
                            const m = c.media.find((x) => x.metadata?.angle === angle);
                            const idx = m ? c.media.indexOf(m) : -1;
                            return m ? (
                              <button key={angle} onClick={() => setLightbox({ character: c, index: idx })} className="relative aspect-[3/4] rounded overflow-hidden bg-bg-card group">
                                <img src={m.fileUrl} alt={angle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] py-0.5 text-center">{angle === "front" ? "Front" : angle === "three-quarter" ? "3/4" : "Profile"}</span>
                              </button>
                            ) : <div key={angle} className="aspect-[3/4] rounded bg-bg-card/50 grid place-items-center text-text-muted text-[10px]">{angle}</div>;
                          })}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {["back","action"].map((angle) => {
                            const m = c.media.find((x) => x.metadata?.angle === angle);
                            const idx = m ? c.media.indexOf(m) : -1;
                            return m ? (
                              <button key={angle} onClick={() => setLightbox({ character: c, index: idx })} className="relative aspect-video rounded overflow-hidden bg-bg-card group">
                                <img src={m.fileUrl} alt={angle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] py-0.5 text-center">{angle === "back" ? "Back View" : "Action"}</span>
                              </button>
                            ) : <div key={angle} className="aspect-video rounded bg-bg-card/50 grid place-items-center text-text-muted text-[10px]">{angle}</div>;
                          })}
                        </div>
                        <div className="text-center">
                          <span className="text-accent text-sm font-bold">{c.name}</span>
                          {c.roleType && <span className="text-text-muted text-xs ms-2">— {c.roleType}</span>}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lightbox && (() => {
        const gallery = lightbox.character.media;
        const m = gallery[lightbox.index];
        if (!m) return null;
        const go = (delta: number) => setLightbox({ character: lightbox.character, index: (lightbox.index + delta + gallery.length) % gallery.length });
        const created = m.createdAt ? new Date(m.createdAt).toLocaleString() : "—";
        const provider = m.metadata?.provider ?? "fal.ai/nano-banana";
        return (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50" onClick={() => setLightbox(null)}>
            <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-center gap-2">
                {gallery.length > 1 && (
                  <button onClick={() => go(lang === "he" ? 1 : -1)} className="bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full shrink-0 text-xl" aria-label="prev">‹</button>
                )}
                <img src={m.fileUrl} alt={m.metadata?.angle ?? ""} className="max-w-full max-h-[80vh] rounded-lg" />
                {gallery.length > 1 && (
                  <button onClick={() => go(lang === "he" ? -1 : 1)} className="bg-black/70 hover:bg-black text-white w-10 h-10 rounded-full shrink-0 text-xl" aria-label="next">›</button>
                )}
              </div>
              <button onClick={() => setLightbox(null)} className="absolute top-2 end-2 bg-black/70 text-white w-8 h-8 rounded-full">✕</button>
              <div className="mt-3 bg-black/70 text-white rounded-lg p-3 text-xs flex flex-wrap gap-x-6 gap-y-1 items-center">
                <div><span className="text-white/60">{lang === "he" ? "דמות" : "Character"}: </span><span className="font-semibold">{lightbox.character.name}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "זווית" : "Angle"}: </span><span className="font-semibold">{m.metadata?.angle ?? "—"}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "מודל" : "Model"}: </span><span className="font-semibold">{provider}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "נוצר" : "Created"}: </span><span className="num">{created}</span></div>
                <div><span className="text-white/60">{lang === "he" ? "עלות" : "Cost"}: </span><span className="num font-semibold">${(m.cost ?? 0).toFixed(4)}</span></div>
                <div className="ms-auto text-white/60 num">{lightbox.index + 1} / {gallery.length}</div>
              </div>
            </div>
          </div>
        );
      })()}

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
