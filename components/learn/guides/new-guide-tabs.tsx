"use client";
import { learnFetch } from "@/lib/learn/fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminHeaders, getAdminKey } from "@/lib/learn/admin-key";
import { GUIDE_LANGUAGES, DEFAULT_LANG, type GuideLang } from "@/lib/learn/guide-languages";

const RECOMMENDED_SOURCES = [
  { name: "claude-school", url: "https://claude-school-nu.vercel.app/guides/ai-2026-04-14", desc: "AI guides (Hebrew)" },
  { name: "wikiHow", url: "https://www.wikihow.com/", desc: "How-to articles" },
  { name: "Hugging Face", url: "https://huggingface.co/learn", desc: "ML/AI courses" },
  { name: "LangChain Docs", url: "https://python.langchain.com/docs/introduction/", desc: "LLM frameworks" },
  { name: "Anthropic Cookbook", url: "https://github.com/anthropics/anthropic-cookbook", desc: "Claude examples" },
  { name: "Google AI Devs", url: "https://ai.google.dev/gemini-api/docs", desc: "Gemini docs" },
  { name: "fal.ai docs", url: "https://docs.fal.ai/", desc: "Image/video models" },
  { name: "Replicate Guides", url: "https://replicate.com/guides", desc: "ML model how-tos" },
  { name: "Real Python", url: "https://realpython.com/", desc: "Python tutorials" },
  { name: "MDN Web Docs", url: "https://developer.mozilla.org/", desc: "Web platform reference" },
];

type Tab = "manual" | "ai" | "url" | "instagram";

export default function NewGuideTabs() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manual");
  const [lang, setLang] = useState<GuideLang>(DEFAULT_LANG);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState("");

  // manual
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  // ai
  const [aiTopic, setAiTopic] = useState("");

  // url / ig
  const [importUrl, setImportUrl] = useState("");

  function checkAuth(): boolean {
    if (!getAdminKey()) {
      setErr("הגדר admin key ב-/admin תחילה");
      return false;
    }
    return true;
  }

  async function createManual() {
    if (!title.trim()) { setErr("כותרת חובה"); return; }
    if (!checkAuth()) return;
    setPending(true); setErr("");
    try {
      const res = await learnFetch("/api/v1/learn/guides", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ title, description, category: category || null, lang, source: "manual" }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "create failed");
      router.push(`/guides/${j.guide.slug}/edit`);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setPending(false);
    }
  }

  async function createFromAi() {
    if (!aiTopic.trim()) { setErr("נושא חובה"); return; }
    if (!checkAuth()) return;
    setPending(true); setErr("");
    try {
      const res = await learnFetch("/api/v1/learn/guides/ai-create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ topic: aiTopic, lang }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "ai-create failed");
      router.push(`/guides/${j.guide.slug}/edit`);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setPending(false);
    }
  }

  async function createFromUrl() {
    if (!importUrl.trim()) { setErr("URL חובה"); return; }
    if (!checkAuth()) return;
    setPending(true); setErr("");
    try {
      const res = await learnFetch("/api/v1/learn/guides/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ url: importUrl, lang }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "import failed");
      router.push(`/guides/${j.guide.slug}/edit`);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setPending(false);
    }
  }

  async function createFromInstagram() {
    if (!importUrl.trim()) { setErr("URL חובה"); return; }
    if (!checkAuth()) return;
    setPending(true); setErr("");
    try {
      const res = await learnFetch("/api/v1/learn/guides/import-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ url: importUrl, lang }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "import failed");
      router.push(`/guides/${j.guide.slug}/edit`);
    } catch (e: any) {
      setErr(e?.message || "שגיאה");
    } finally {
      setPending(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "manual", label: "ידני", icon: "✍️" },
    { key: "ai", label: "מ-AI", icon: "🤖" },
    { key: "url", label: "מ-URL", icon: "🔗" },
    { key: "instagram", label: "מ-Instagram", icon: "📷" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setErr(""); }}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${tab === t.key ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
          >
            <span className="mr-1">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">שפת מקור</label>
          <select value={lang} onChange={(e) => setLang(e.target.value as GuideLang)} className="px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm">
            {GUIDE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>

        {tab === "manual" && (
          <>
            <Field label="כותרת *" value={title} onChange={setTitle} />
            <Field label="תיאור" value={description} onChange={setDescription} multiline />
            <Field label="קטגוריה (אופציונלי)" value={category} onChange={setCategory} placeholder="AI / DIY / מתכונים…" />
            <button onClick={createManual} disabled={pending} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50">
              {pending ? "🔄 יוצר…" : "📝 צור מדריך ריק (אעבור לעורך)"}
            </button>
          </>
        )}

        {tab === "ai" && (
          <>
            <Field label="נושא המדריך *" value={aiTopic} onChange={setAiTopic} multiline placeholder='לדוגמה: "איך לבנות פרומפט וידאו טוב ל-Sora"' />
            <p className="text-[11px] text-slate-500">Gemini ייצור 4-6 שלבים מובנים (התחלה / אמצע / סוף) עם תוכן מלא בשפה שבחרת.</p>
            <button onClick={createFromAi} disabled={pending} className="bg-purple-500 hover:bg-purple-400 text-white font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50">
              {pending ? "🔄 Gemini עובד…" : "🤖 חולל מדריך מלא"}
            </button>
          </>
        )}

        {tab === "url" && (
          <>
            <Field label="URL של מדריך *" value={importUrl} onChange={setImportUrl} placeholder="https://..." />
            <button onClick={createFromUrl} disabled={pending} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50">
              {pending ? "🔄 מושך…" : "🔗 ייבא מ-URL"}
            </button>

            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="text-[11px] text-slate-500 mb-2">מקורות מומלצים (לחץ להדבקה):</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {RECOMMENDED_SOURCES.map((s) => (
                  <button key={s.url} onClick={() => setImportUrl(s.url)} className="text-right text-xs p-2 bg-slate-950/50 hover:bg-slate-800 border border-slate-800 rounded">
                    <div className="text-cyan-300 font-mono truncate">{s.name}</div>
                    <div className="text-[10px] text-slate-500">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "instagram" && (
          <>
            <Field label="קישור Instagram (reel / post) *" value={importUrl} onChange={setImportUrl} placeholder="https://www.instagram.com/p/..." />
            <p className="text-[11px] text-slate-500">משתמש באותו מנוע ייבוא של פרומפטים — caption + thumbnail מהפוסט.</p>
            <button onClick={createFromInstagram} disabled={pending} className="bg-pink-500 hover:bg-pink-400 text-white font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50">
              {pending ? "🔄 מושך…" : "📷 ייבא מ-Instagram"}
            </button>
          </>
        )}

        {err && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded p-2 text-xs">⚠ {err}</div>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, placeholder }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm focus:border-cyan-500 focus:outline-none" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-white text-sm focus:border-cyan-500 focus:outline-none" />
      )}
    </div>
  );
}
