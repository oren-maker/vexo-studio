"use client";
import { learnFetch } from "@/lib/learn/fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";
import { GUIDE_LANGUAGES, isRtl } from "@/lib/learn/guide-languages";

type Guide = any;

export default function GuideEditor({ initialGuide, initialLang }: { initialGuide: Guide; initialLang: string }) {
  const router = useRouter();
  const [guide, setGuide] = useState<Guide>(initialGuide);
  const [lang, setLang] = useState<string>(initialLang);
  const [translating, setTranslating] = useState(false);
  const [err, setErr] = useState("");
  const dir = isRtl(lang) ? "rtl" : "ltr";

  function getTrans(item: any): { title: string; content?: string; description?: string } | null {
    return item.translations?.find((t: any) => t.lang === lang) || item.translations?.find((t: any) => t.lang === guide.defaultLang) || item.translations?.[0] || null;
  }

  async function saveGuideMeta(updates: any) {
    if (!getAdminKey()) { setErr("הגדר admin key ב-/admin"); return; }
    try {
      await learnFetch(`/api/v1/learn/guides/${guide.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ ...updates, lang }),
      });
      router.refresh();
    } catch (e: any) { setErr(e?.message || "save error"); }
  }

  async function addStage() {
    if (!getAdminKey()) { setErr("הגדר admin key"); return; }
    try {
      const res = await learnFetch(`/api/v1/learn/guides/${guide.slug}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ title: `שלב חדש`, content: "", lang }),
      });
      const j = await res.json();
      if (j.ok) {
        const next = { ...guide, stages: [...guide.stages, j.stage] };
        setGuide(next);
      }
    } catch (e: any) { setErr(e?.message || "error"); }
  }

  async function saveStage(stageId: string, patch: any) {
    if (!getAdminKey()) return;
    await learnFetch(`/api/v1/learn/guides/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ ...patch, lang }),
    });
  }

  async function deleteStage(stageId: string) {
    if (!confirm("למחוק את השלב?")) return;
    if (!getAdminKey()) return;
    await learnFetch(`/api/v1/learn/guides/stages/${stageId}`, { method: "DELETE", headers: adminHeaders() });
    setGuide({ ...guide, stages: guide.stages.filter((s: any) => s.id !== stageId) });
  }

  async function aiFillStage(stageId: string) {
    if (!getAdminKey()) { setErr("הגדר admin key"); return; }
    try {
      const res = await learnFetch(`/api/v1/learn/guides/stages/${stageId}/ai-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ lang }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "AI fill failed");
      router.refresh();
    } catch (e: any) { setErr(e?.message || "error"); }
  }

  async function uploadImageToStage(stageId: string, file: File) {
    if (!getAdminKey()) { setErr("הגדר admin key"); return; }
    try {
      const blob = await upload(`guides/${guide.slug}/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/v1/learn/guides/upload",
        headers: adminHeaders() as any,
      });
      await learnFetch(`/api/v1/learn/guides/stages/${stageId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ blobUrl: blob.url, source: "upload" }),
      });
      router.refresh();
    } catch (e: any) { setErr(e?.message || "upload error"); }
  }

  async function deleteImage(stageId: string, imageId: string) {
    if (!getAdminKey()) return;
    await learnFetch(`/api/v1/learn/guides/stages/${stageId}/images?imageId=${imageId}`, { method: "DELETE", headers: adminHeaders() });
    router.refresh();
  }

  async function translateAll() {
    setTranslating(true); setErr("");
    try {
      // Trigger translation for each non-source lang lazily by calling GET with lang
      for (const l of GUIDE_LANGUAGES) {
        if (l.code === guide.defaultLang) continue;
        await learnFetch(`/api/v1/learn/guides/${guide.slug}?lang=${l.code}`, { cache: "no-store" });
      }
      router.refresh();
    } catch (e: any) { setErr(e?.message || "translate error"); }
    finally { setTranslating(false); }
  }

  const trans = getTrans(guide);

  return (
    <div className="space-y-5" dir={dir}>
      {/* Lang switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {GUIDE_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`text-xs px-2 py-1 rounded border ${lang === l.code ? "bg-cyan-500 text-slate-950 border-cyan-400 font-bold" : "bg-slate-900 text-slate-300 border-slate-700 hover:text-white"}`}
            >
              {l.flag} {l.name}
            </button>
          ))}
        </div>
        <button onClick={translateAll} disabled={translating} className="text-xs bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 px-3 py-1.5 rounded disabled:opacity-50">
          {translating ? "🔄 מתרגם…" : "🌐 תרגם לכל השפות"}
        </button>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-2 text-xs">⚠ {err}</div>}

      {/* Guide metadata */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-xs text-slate-500 uppercase">פרטי המדריך</div>
        <input
          defaultValue={trans?.title || ""}
          onBlur={(e) => saveGuideMeta({ title: e.target.value })}
          placeholder="כותרת המדריך"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-base font-bold"
        />
        <textarea
          defaultValue={trans?.description || ""}
          onBlur={(e) => saveGuideMeta({ description: e.target.value })}
          placeholder="תיאור קצר"
          rows={2}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm"
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <input
            defaultValue={guide.category || ""}
            onBlur={(e) => saveGuideMeta({ category: e.target.value })}
            placeholder="קטגוריה"
            className="px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm"
          />
          <input
            type="number"
            defaultValue={guide.estimatedMinutes || ""}
            onBlur={(e) => saveGuideMeta({ estimatedMinutes: Number(e.target.value) || null })}
            placeholder="זמן קריאה (דקות)"
            className="px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm"
          />
          <input
            defaultValue={guide.coverImageUrl || ""}
            onBlur={(e) => saveGuideMeta({ coverImageUrl: e.target.value || null })}
            placeholder="URL של תמונת cover"
            className="px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm"
            dir="ltr"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-slate-300">
            <input
              type="checkbox"
              defaultChecked={guide.isPublic}
              onChange={(e) => saveGuideMeta({ isPublic: e.target.checked })}
            />
            ציבורי (גישה ללא admin key)
          </label>
          <select
            defaultValue={guide.status}
            onChange={(e) => saveGuideMeta({ status: e.target.value })}
            className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-white text-xs"
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </div>
      </section>

      {/* Stages */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-white">שלבים ({guide.stages.length})</h2>
          <div className="flex gap-2">
            <BulkImageUpload guideSlug={guide.slug} onDone={() => window.location.reload()} />
            <button onClick={addStage} className="text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3 py-1.5 rounded">
              ➕ הוסף שלב
            </button>
          </div>
        </div>

        {guide.stages.map((stage: any, i: number) => {
          const stageTrans = getTrans(stage);
          return (
            <div key={stage.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded">שלב {i + 1}</span>
                  <select
                    defaultValue={stage.type}
                    onChange={(e) => saveStage(stage.id, { type: e.target.value })}
                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-white text-xs"
                  >
                    <option value="start">התחלה</option>
                    <option value="middle">אמצע</option>
                    <option value="end">סיום</option>
                  </select>
                  <select
                    defaultValue={stage.transitionToNext}
                    onChange={(e) => saveStage(stage.id, { transitionToNext: e.target.value })}
                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-white text-xs"
                  >
                    <option value="fade">fade</option>
                    <option value="slide">slide</option>
                    <option value="instant">instant</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => aiFillStage(stage.id)} className="text-[10px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 px-2 py-1 rounded">
                    🤖 חולל תוכן
                  </button>
                  <button onClick={() => deleteStage(stage.id)} className="text-[10px] text-red-400 hover:text-red-300 px-2">✕ הסר</button>
                </div>
              </div>

              <input
                defaultValue={stageTrans?.title || ""}
                onBlur={(e) => saveStage(stage.id, { title: e.target.value, content: stageTrans?.content || "" })}
                placeholder="כותרת השלב"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-base font-semibold"
              />

              <textarea
                defaultValue={stageTrans?.content || ""}
                onBlur={(e) => saveStage(stage.id, { title: stageTrans?.title || "", content: e.target.value })}
                placeholder="תוכן השלב (markdown נתמך)"
                rows={6}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm leading-relaxed"
              />

              {/* Images */}
              <div>
                <div className="text-[10px] uppercase text-slate-500 mb-2">תמונות בשלב ({stage.images?.length || 0})</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {stage.images?.map((img: any) => (
                    <div key={img.id} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.blobUrl} alt="" className="w-full aspect-video object-cover rounded border border-slate-700" />
                      <button
                        onClick={() => deleteImage(stage.id, img.id)}
                        className="absolute top-1 left-1 bg-red-500/80 hover:bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <label className="flex items-center justify-center aspect-video bg-slate-950/50 border border-dashed border-slate-700 rounded text-xs text-slate-400 hover:border-cyan-500 cursor-pointer">
                    + העלה תמונה
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadImageToStage(stage.id, e.target.files[0])}
                    />
                  </label>
                </div>
              </div>
            </div>
          );
        })}

        {guide.stages.length === 0 && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
            עדיין אין שלבים. לחץ &quot;➕ הוסף שלב&quot; כדי להתחיל.
          </div>
        )}
      </section>
    </div>
  );
}

// Bulk image upload → Gemini vision → auto-creates stages. Use when Instagram
// embed only returned first 3 carousel slides and the user has the rest as
// screenshots. Supports drag-drop + multi-select + chunked parallel processing.
function BulkImageUpload({ guideSlug, onDone }: { guideSlug: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<File[]>([]);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function uploadBatch(batch: File[]): Promise<{ succeeded: number; failed: number }> {
    const fd = new FormData();
    batch.forEach((f) => fd.append("files", f));
    const key = getAdminKey();
    const res = await fetch(`/api/v1/learn/guides/${guideSlug}/analyze-images`, {
      method: "POST",
      headers: key ? { "x-vexo-admin-key": key } : {},
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return { succeeded: data.succeeded ?? 0, failed: data.failed ?? 0 };
  }

  async function start(files: File[]) {
    if (files.length === 0) return;
    if (!confirm(`לנתח ${files.length} תמונות ולהוסיף אותן כשלבים חדשים? (בערך ${Math.ceil(files.length * 2)} שניות סה"כ)`)) return;
    setBusy(true);
    setQueued(files); setDone(0); setFailed(0); setErr(null);

    // Client-side chunking: batches of 5 run in parallel on the server; we fire
    // several batches one after another so progress advances steadily without
    // hitting Vercel's 60s duration limit on a single request.
    const BATCH = 5;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      try {
        const r = await uploadBatch(batch);
        setDone((d) => d + r.succeeded);
        setFailed((f) => f + r.failed);
      } catch (e) {
        setFailed((f) => f + batch.length);
        setErr((e as Error).message);
      }
    }
    setTimeout(onDone, 600);
  }

  function onFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) { setErr("בחר לפחות תמונה אחת"); return; }
    void start(arr);
  }

  return (
    <div className="relative">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); onFiles(e.dataTransfer.files); }}
        className={`block px-3 py-1.5 rounded cursor-pointer text-xs font-semibold transition
          ${busy ? "bg-slate-700 text-slate-300"
            : dragActive ? "bg-purple-400 text-white ring-2 ring-purple-300"
            : "bg-purple-500 hover:bg-purple-400 text-white"}`}
      >
        {busy
          ? `🖼 ${done + failed}/${queued.length}${failed > 0 ? ` (⚠ ${failed})` : ""}`
          : "🖼 הוסף תמונות (גרור או בחר)"}
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
      {busy && queued.length > 0 && (
        <div className="absolute top-full mt-1 right-0 w-64 bg-slate-900 border border-slate-700 rounded-lg p-2 text-[10px] text-slate-300 shadow-lg z-20">
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-1">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${((done + failed) / queued.length) * 100}%` }} />
          </div>
          <div>עובד על {queued.length} תמונות... {done} הושלמו{failed > 0 ? ` · ${failed} נכשלו` : ""}</div>
          {err && <div className="text-rose-400 mt-1 truncate" title={err}>{err}</div>}
        </div>
      )}
    </div>
  );
}
