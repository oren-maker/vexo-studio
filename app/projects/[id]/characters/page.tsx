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

  // Cast composite — one side-by-side reference image for Sora/VEO multi-cast
  type CastComposite = { id: string; fileUrl: string; createdAt: string; metadata: { characterCount?: number; characterNames?: string[]; layoutDescription?: string; builtAt?: string } };
  const [composite, setComposite] = useState<CastComposite | null>(null);
  const [compositeBusy, setCompositeBusy] = useState(false);
  const [compositeErr, setCompositeErr] = useState<string | null>(null);

  async function load() {
    const r = await api<Character[]>(`/api/v1/projects/${id}/characters`).catch(() => [] as Character[]);
    setChars(r);
    const comp = await api<{ composite: CastComposite | null }>(`/api/v1/projects/${id}/cast-composite`).catch(() => ({ composite: null }));
    setComposite(comp.composite);
  }
  useEffect(() => { load(); }, [id]);

  async function buildCastComposite() {
    setCompositeBusy(true); setCompositeErr(null);
    try {
      await api<{ asset: CastComposite }>(
        `/api/v1/projects/${id}/cast-composite`,
        { method: "POST", body: {}, timeoutMs: 90_000 },
      );
      // rehydrate from fresh GET so metadata is consistent
      await load();
    } catch (e) { setCompositeErr((e as Error).message); }
    finally { setCompositeBusy(false); }
  }

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
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: {} });
      load();
    } catch (e) { alert((e as Error).message); }
    finally { setGenBusy(null); }
  }

  async function generateRest(cid: string) {
    setGenBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: {} });
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
      ? `למחוק את הגיליון הקיים של ${name} ולייצר גיליון דמות חדש בתמונה אחת? (~$0.04)`
      : `Delete ${name}'s current sheet and generate a fresh single-image character sheet? (~$0.04)`)) return;
    setGenBusy(cid);
    try {
      await api(`/api/v1/characters/${cid}/generate-gallery`, { method: "POST", body: { regenerate: true } });
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
    const est = (missing * 0.039).toFixed(2);
    if (!confirm(lang === "he" ? `לייצר גיליון דמות לכל ${missing} דמויות חסרות? עלות משוערת: $${est} (תמונה אחת לדמות)` : `Generate a character sheet for ${missing} characters? Estimated: $${est} (one image each)`)) return;
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
            <div className="text-xs text-text-muted">{lang === "he" ? "גיליון דמות אחד לכל דמות — תמונה יחידה עם כל הזוויות, הבעות ופרטי תלבושת" : "One character sheet per character — single image with all angles, expressions and wardrobe details"}</div>
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
                    <div className="text-xs text-text-muted" data-no-translate>{[c.roleType, c.gender, c.ageRange].filter(Boolean).join(" · ")}</div>
                  </Link>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(c)} className="text-xs px-2 py-1 rounded border border-bg-card">{lang === "he" ? "ערוך" : "Edit"}</button>
                    <button onClick={() => del(c.id)} className="text-xs px-2 py-1 rounded border border-status-errText text-status-errText">{lang === "he" ? "מחק" : "Delete"}</button>
                  </div>
                </div>

                {c.appearance && <div className="text-xs text-text-secondary line-clamp-3">{c.appearance}</div>}

                <div>
                  <div className="flex justify-between items-center mb-2 gap-2">
                    <span className="text-xs font-semibold">
                      {(() => {
                        const sheet = c.media.find((m) => m.metadata?.angle === "sheet");
                        if (sheet) return lang === "he" ? "✅ גיליון דמות" : "✅ Character sheet";
                        return lang === "he" ? "דמות" : "Character";
                      })()}
                      {c.media.length > 0 && <span className="num text-text-muted ms-2">${c.media.reduce((s, m) => s + (m.cost ?? 0), 0).toFixed(3)}</span>}
                    </span>
                    <div className="flex gap-1">
                      {c.media.length === 0 && (
                        <button disabled={genBusy === c.id} onClick={() => generateOne(c.id)} className="text-xs px-2 py-1 rounded-lg bg-accent text-white disabled:opacity-50">
                          {genBusy === c.id ? (lang === "he" ? "מייצר…" : "…") : (lang === "he" ? "✨ בנה גיליון דמות" : "✨ Build character sheet")}
                        </button>
                      )}
                      {c.media.length > 0 && (
                        <button disabled={genBusy === c.id} onClick={() => regenerateAll(c.id, c.name)} className="text-xs px-2 py-1 rounded-lg border border-status-errText text-status-errText disabled:opacity-50" title={lang === "he" ? "מוחק הכל ומייצר גיליון דמות חדש בתמונה אחת" : "Wipe + regenerate a fresh single-image character sheet"}>
                          {genBusy === c.id ? (lang === "he" ? "מייצר…" : "…") : (lang === "he" ? "🔄 ייצר מחדש" : "🔄 Regenerate")}
                        </button>
                      )}
                    </div>
                  </div>
                  {c.media.length === 0 ? (
                    <div className="text-xs text-text-muted text-center py-6 bg-bg-card rounded-lg">
                      <div className="text-3xl mb-2">🎭</div>
                      <div>{lang === "he" ? "אין גיליון דמות עדיין" : "No character sheet yet"}</div>
                      <div className="text-[10px] text-text-muted mt-1">{lang === "he" ? "לחץ \"בנה גיליון דמות\" — תמונה אחת עם כל הזוויות, בניגוד למערכת הישנה של 5 תמונות נפרדות" : "Click \"Build\" — one image with all angles, not 5 separate ones"}</div>
                    </div>
                  ) : (() => {
                    // Prefer sheet (new single-image format) → composite (built post-hoc)
                    // → fallback to first media
                    const sheet = c.media.find((m) => m.metadata?.angle === "sheet");
                    if (sheet) {
                      return (
                        <div className="bg-[#121216] rounded-lg p-2">
                          <button
                            onClick={() => setLightbox({ character: c, index: c.media.indexOf(sheet) })}
                            className="block w-full rounded overflow-hidden bg-bg-card group"
                          >
                            <img src={sheet.fileUrl} alt={`${c.name} sheet`} className="w-full h-auto object-contain group-hover:scale-[1.01] transition-transform" />
                          </button>
                        </div>
                      );
                    }
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
                    // Legacy data (old 5-angle sets with no sheet / no composite) — show
                    // a single CTA to regenerate into the new single-sheet format.
                    // No more 5-cell grid renders.
                    return (
                      <div className="bg-[#121216] rounded-lg p-4 text-center">
                        <div className="text-4xl mb-2">🎭</div>
                        <div className="text-xs text-text-muted mb-3">
                          {lang === "he"
                            ? "לדמות הזו יש תמונות בפורמט הישן (זוויות נפרדות). לחץ למטה כדי לעבור לגיליון דמות יחיד בתמונה אחת."
                            : "This character has images in the legacy format (separate angles). Click below to migrate to a single-image character sheet."}
                        </div>
                        <button
                          onClick={() => regenerateAll(c.id, c.name)}
                          disabled={genBusy === c.id}
                          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {genBusy === c.id ? "🔄 בונה…" : (lang === "he" ? "🎨 צור גיליון דמות חדש (~$0.04)" : "🎨 Build new character sheet (~$0.04)")}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Cast composite — one reference image with ALL characters for Sora/VEO i2v identity lock.
          Oren asked: "תוסיף תמונה של לקט של כל הדמויות שיהיה בחלק התחתון, שהבמאי יכיר את זה". */}
      {chars.length >= 2 && (
        <div className="bg-bg-card rounded-card border border-bg-main p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-lg font-bold">🎭 {lang === "he" ? "לקט דמויות (reference לבמאי)" : "Cast composite (director reference)"}</div>
              <div className="text-xs text-text-muted">
                {lang === "he"
                  ? "תמונה אחת עם כל הדמויות זו-לצד-זו ושמות בתחתית. נשלחת אוטומטית כ-input_reference לסצנות עם מספר דמויות (Sora/VEO)."
                  : "One image with every character side-by-side + names below. Auto-sent as input_reference for multi-character scenes (Sora/VEO)."}
              </div>
            </div>
            <button
              onClick={buildCastComposite}
              disabled={compositeBusy || chars.length < 2}
              className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50"
            >
              {compositeBusy
                ? (lang === "he" ? "בונה…" : "Building…")
                : composite
                ? (lang === "he" ? "🔄 בנה מחדש" : "🔄 Rebuild")
                : (lang === "he" ? "✨ בנה עכשיו" : "✨ Build now")}
            </button>
          </div>
          {compositeErr && <div className="bg-status-errBg text-status-errText rounded-lg p-2 text-xs mb-3">⚠ {compositeErr}</div>}
          {composite ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={composite.fileUrl} alt="cast composite" className="w-full rounded-lg border border-bg-main" />
              <div className="text-[11px] text-text-muted flex flex-wrap gap-x-4 gap-y-1">
                <span>{lang === "he" ? "דמויות בתמונה:" : "Characters:"} <span className="font-semibold">{composite.metadata?.characterCount ?? "?"}</span></span>
                <span>{lang === "he" ? "נבנה:" : "Built:"} <span className="num">{new Date(composite.createdAt).toLocaleString(lang === "he" ? "he-IL" : undefined)}</span></span>
                <a href={composite.fileUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ms-auto">
                  {lang === "he" ? "פתח בגודל מלא ↗" : "Open full size ↗"}
                </a>
              </div>
              {composite.metadata?.characterNames && composite.metadata.characterNames.length > 0 && (
                <div className="text-[11px] text-text-muted">
                  {lang === "he" ? "בסדר זה-לצד-זה:" : "Left-to-right:"} {composite.metadata.characterNames.join(" · ")}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-text-muted bg-bg-main rounded-lg p-4 text-center">
              {lang === "he" ? "עדיין לא נבנתה. לחץ 'בנה עכשיו' כדי לייצר." : "Not built yet. Click 'Build now' to generate."}
            </div>
          )}
        </div>
      )}

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
