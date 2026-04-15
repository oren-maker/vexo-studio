"use client";

import { useState, useTransition } from "react";
import SyncProgress from "@/components/learn/sync-progress";
import {
  runSeedanceSyncAction,
  runGithubSyncAction,
  runJsonImportAction,
  runCsvImportAction,
  runMultiSyncAction,
  runKnowledgeExtractionAction,
  runPatternExtractionAction,
} from "./actions";

type Tab = "seedance" | "multi" | "github" | "json" | "csv" | "knowledge";

export default function SyncPage() {
  const [tab, setTab] = useState<Tab>("seedance");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  // Seedance
  function syncSeedance() {
    setErr(""); setResult(null);
    startTransition(async () => {
      const r = await runSeedanceSyncAction();
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }

  // GitHub
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");
  const [token, setToken] = useState("");
  function syncGithub() {
    setErr(""); setResult(null);
    startTransition(async () => {
      const r = await runGithubSyncAction({ owner, repo, path, token });
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }

  // JSON
  const [jsonText, setJsonText] = useState("");
  function importJson() {
    setErr(""); setResult(null);
    startTransition(async () => {
      const r = await runJsonImportAction(jsonText);
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }

  // CSV
  const [csvText, setCsvText] = useState("");
  function importCsv() {
    setErr(""); setResult(null);
    startTransition(async () => {
      const r = await runCsvImportAction(csvText);
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "seedance", label: "Seedance", icon: "🎬" },
    { key: "multi", label: "Sora + עוד", icon: "🌐" },
    { key: "knowledge", label: "חילוץ Knowledge", icon: "🧠" },
    { key: "github", label: "GitHub Repo", icon: "🐙" },
    { key: "json", label: "JSON", icon: "{}" },
    { key: "csv", label: "CSV", icon: "📊" },
  ];

  function syncMulti() {
    setErr(""); setResult(null);
    startTransition(async () => {
      const r = await runMultiSyncAction();
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }
  function extractKnowledge() {
    setErr(""); setResult(null);
    startTransition(async () => {
      const r = await runKnowledgeExtractionAction(200);
      if (!r.ok) setErr(r.error); else setResult(r);
    });
  }
  const [jobId, setJobId] = useState<string | null>(null);
  async function extractPattern() {
    setErr(""); setResult(null); setJobId(null);
    try {
      const res = await fetch("/api/learn/pattern-extract", { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setJobId(j.jobId);
    } catch (e: any) {
      setErr(e.message || "שגיאה");
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">סנכרון מקורות פרומפטים</h1>
      <p className="text-sm text-slate-400 mb-6">
        הזן פרומפטים למערכת ממקורות שונים. כולם נשמרים כ-LearnSources ומשמשים כמקור למידה ל-VEXO Director.
      </p>

      <div className="flex gap-1 mb-5 bg-slate-900/60 border border-slate-800 rounded-lg p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setResult(null); setErr(""); }}
            className={`px-4 py-2 rounded text-sm font-medium transition whitespace-nowrap ${
              tab === t.key ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="ml-1">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === "seedance" && (
        <Panel
          title="Seedance 2.0 Prompts"
          subtitle="1700+ פרומפטים של ByteDance Seedance 2.0 מ-YouMind-OpenLab/awesome-seedance-2-prompts. ה-README חושף 106 (100 רגילים + 6 Featured) בשל מגבלת GitHub content length."
        >
          <button
            onClick={syncSeedance}
            disabled={pending}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
          >
            {pending ? "מסנכרן..." : "🚀 סנכרן Seedance"}
          </button>
          <div className="text-[11px] text-slate-500 mt-3">
            רץ גם אוטומטית כל יום ב-03:00 UTC דרך Vercel Cron.
          </div>
        </Panel>
      )}

      {tab === "multi" && (
        <Panel
          title="מאגרי פרומפטים נוספים"
          subtitle="4 ריפוזיטוריז פתוחים של Sora / AI Video prompts: hr98w/awesome-sora-prompts (טכניקות), SoraEase (דוגמאות רשמיות של OpenAI), xjpp22 (סגנונות במאים), geekjourneyx/awesome-ai-video-prompts. ~100 פרומפטים נוספים."
        >
          <button
            onClick={syncMulti}
            disabled={pending}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
          >
            {pending ? "מסנכרן..." : "🚀 סנכרן את כל המאגרים"}
          </button>
          <div className="text-[11px] text-slate-500 mt-3">
            בטוח להפעלה חוזרת — upsert לפי externalId. הפרומפטים משתלבים עם הדטאסט הקיים של Seedance.
          </div>
        </Panel>
      )}

      {tab === "knowledge" && (
        <div className="space-y-4">
          <Panel
            title="חילוץ Knowledge — Pattern Matching (מומלץ)"
            subtitle="מנתח את הטקסט של כל 205 הפרומפטים לפי ספריית דפוסים קולנועיים (130+ טכניקות, 24 סגנונות, 14 moods, 25 תגיות). רץ באופן מקומי — ללא תלות ב-API, 1000+ nodes בתוך כ-3 דקות."
          >
            <button
              onClick={extractPattern}
              disabled={pending}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {pending ? "מנתח..." : "⚡ הרץ ניתוח דפוסים"}
            </button>
            <div className="text-[11px] text-slate-500 mt-3">
              מיידי · בטוח להפעלה חוזרת · יעדכן analyses קיימים שהם רזים מדי (פחות techniques).
            </div>
          </Panel>

          <Panel
            title="חילוץ Knowledge מ-Gemini (איכות גבוהה יותר, דורש מפתח פעיל)"
            subtitle="שולח כל פרומפט ל-Gemini Flash ומקבל ניתוח semantic מעמיק. מיועד ל-sources שאין להם עדיין ניתוח דפוסים מלא."
          >
            <button
              onClick={extractKnowledge}
              disabled={pending}
              className="bg-purple-500 hover:bg-purple-400 text-white font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {pending ? "מעבד..." : "🧠 הרץ ב-Gemini"}
            </button>
            <div className="text-[11px] text-slate-500 mt-3">
              איטי (~2s לבקשה) · דורש Gemini quota פנוי · שגיאות quota אינן קריטיות, אפשר להריץ שוב מאוחר.
            </div>
          </Panel>
        </div>
      )}

      {tab === "github" && (
        <Panel
          title="GitHub Repo — פרסור markdown/JSON/YAML"
          subtitle="מושך קבצים מתיקייה ב-repo ציבורי. כל קובץ הופך ל-LearnSource. עובד על *.md, *.json, *.yaml, *.txt."
        >
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Owner" value={owner} onChange={setOwner} placeholder="organization-or-user" />
            <Field label="Repo" value={repo} onChange={setRepo} placeholder="repo-name" />
          </div>
          <Field label="Path" value={path} onChange={setPath} placeholder="prompts (או תיקייה ספציפית)" />
          <Field label="GitHub Token (אופציונלי ל-repos פרטיים)" value={token} onChange={setToken} placeholder="ghp_..." type="password" />
          <button
            onClick={syncGithub}
            disabled={pending || !owner || !repo || !path}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50 mt-2"
          >
            {pending ? "מסנכרן..." : "🚀 סנכרן repo"}
          </button>
        </Panel>
      )}

      {tab === "json" && (
        <Panel
          title="הדבקת JSON"
          subtitle={`הדבק מערך פרומפטים או אובייקט {prompts:[...]}. כל פריט יכול להכיל: title, prompt (חובה), videoUrl, thumbnail, externalId, url.`}
        >
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={12}
            placeholder={`[
  {
    "title": "Cinematic sunset",
    "prompt": "A sweeping drone shot over golden hills...",
    "videoUrl": "https://...",
    "externalId": "my-prompt-1"
  }
]`}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono focus:border-cyan-500 focus:outline-none mb-3"
            dir="ltr"
          />
          <button
            onClick={importJson}
            disabled={pending || !jsonText.trim()}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
          >
            {pending ? "מייבא..." : "📥 ייבא JSON"}
          </button>
        </Panel>
      )}

      {tab === "csv" && (
        <Panel
          title="הדבקת CSV"
          subtitle='כותרת ראשונה חובה עם עמודת "prompt". עמודות אופציונליות: title, videoUrl, thumbnail, externalId.'
        >
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={12}
            placeholder={`title,prompt,videoUrl,externalId
"Sunset shot","A sweeping drone shot over golden hills at sunset","https://...","my-1"
"Beach","Waves crashing on rocks, slow motion","","my-2"`}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono focus:border-cyan-500 focus:outline-none mb-3"
            dir="ltr"
          />
          <button
            onClick={importCsv}
            disabled={pending || !csvText.trim()}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
          >
            {pending ? "מייבא..." : "📥 ייבא CSV"}
          </button>
        </Panel>
      )}

      {jobId && (
        <SyncProgress
          jobId={jobId}
          steps={["טוען פרומפטים", "מריץ ניתוח דפוסים", "שומר Knowledge Nodes", "הושלם"]}
          onComplete={(r) => { setJobId(null); setResult(r); }}
          onFailed={(e) => { setJobId(null); setErr(e); }}
        />
      )}

      {err && (
        <div className="mt-5 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">
          ⚠ {err}
        </div>
      )}

      {result && (
        <div className="mt-5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-5">
          <div className="text-emerald-300 font-semibold mb-3 text-lg">✅ הושלם</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="נמצאו" value={result.fetched ?? result.received ?? 0} />
            <Stat label="נשמרו/עודכנו" value={(result.upserted || 0) + (result.created || 0)} accent="cyan" />
            <Stat label="עם וידאו" value={result.withVideo ?? "—"} accent="purple" />
          </div>
          {result.errors?.length > 0 && (
            <details className="mt-4">
              <summary className="text-amber-300 cursor-pointer text-sm">שגיאות ({result.errors.length})</summary>
              <ul className="mt-2 text-xs text-slate-400 list-disc pr-4 max-h-40 overflow-y-auto">
                {result.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
          <div className="mt-4 text-sm text-slate-300">
            פתח את <a href="/learn/sources" className="text-cyan-400 underline">רשימת המקורות</a> לצפייה.
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
      <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
      <p className="text-sm text-slate-400 mb-5">{subtitle}</p>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-sm text-slate-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
        dir="ltr"
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: "cyan" | "purple" }) {
  const color = accent === "cyan" ? "text-cyan-300" : accent === "purple" ? "text-purple-300" : "text-white";
  return (
    <div className="bg-slate-900/50 rounded-lg p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
