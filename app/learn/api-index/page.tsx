"use client";
import Link from "next/link";

// Minimal API index — lists the major REST endpoints vexo-studio exposes
// so developers + API-key holders can orient themselves. Not a full
// OpenAPI spec (that's Phase N+1) — just a human-readable map.

type Endpoint = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; auth: "admin" | "api-key" | "public"; description: string };
type Group = { title: string; endpoints: Endpoint[] };

const GROUPS: Group[] = [
  {
    title: "Brain chat",
    endpoints: [
      { method: "POST", path: "/api/v1/learn/brain/chat", auth: "admin", description: "Send a message, get a reply. 30/min rate limit per IP." },
      { method: "GET", path: "/api/v1/learn/brain/chat?sample=...&chatId=...", auth: "admin", description: "Dry-run buildSystemPrompt for inspection (no Gemini call)." },
      { method: "POST", path: "/api/v1/learn/brain/chat/execute", auth: "admin", description: "Execute a brain action. Logs ActionOutcome." },
      { method: "POST", path: "/api/v1/learn/brain/chat/outcome", auth: "admin", description: "Telemetry: report rejected/undone action." },
    ],
  },
  {
    title: "Production (scenes/episodes/series)",
    endpoints: [
      { method: "GET", path: "/api/v1/scenes/[id]", auth: "admin", description: "Scene detail with frames, videos, characters, logs." },
      { method: "POST", path: "/api/v1/scenes/[id]/generate-video", auth: "admin", description: "Submit to Sora/VEO/Vidu. Style guide enforced." },
      { method: "POST", path: "/api/v1/scenes/[id]/approve", auth: "admin", description: "Flip to APPROVED + extract bridge frames." },
      { method: "GET", path: "/api/v1/scenes/[id]/versions", auth: "admin", description: "SceneVersion history for diff." },
      { method: "GET", path: "/api/v1/scenes/[id]/thumbnail", auth: "admin", description: "Best-available thumbnail (video/bridge/frame)." },
      { method: "POST", path: "/api/v1/episodes/[id]/bulk-approve", auth: "admin", description: "Approve all VIDEO_REVIEW scenes in one txn." },
      { method: "POST", path: "/api/v1/episodes/[id]/recap", auth: "admin", description: "Build previously-on video from bridge frames." },
      { method: "POST", path: "/api/v1/episodes/[id]/generate-thumbnail", auth: "admin", description: "nano-banana key-art." },
      { method: "GET", path: "/api/v1/episodes/[id]/completion", auth: "admin", description: "Checklist of what's missing + todos." },
      { method: "POST", path: "/api/v1/series/[id]/auto-summary", auth: "admin", description: "Gemini writes a 3-paragraph series bible." },
    ],
  },
  {
    title: "Characters",
    endpoints: [
      { method: "GET", path: "/api/v1/characters/[id]/bible", auth: "admin", description: "Aggregated facts + scene mentions." },
      { method: "POST", path: "/api/v1/characters/[id]/composite", auth: "admin", description: "Composite sheet from gallery." },
    ],
  },
  {
    title: "Insights & observability",
    endpoints: [
      { method: "GET", path: "/api/v1/learn/insights/calibration", auth: "admin", description: "ECE bucketed by confidence + per-action." },
      { method: "GET", path: "/api/v1/learn/insights/consistency", auth: "admin", description: "Cross-reference drift + missing cast." },
      { method: "GET", path: "/api/v1/learn/costs/summary?days=30", auth: "admin", description: "Cost aggregation by day/provider/category/project." },
      { method: "GET", path: "/api/v1/learn/activity?days=91", auth: "admin", description: "Daily activity counts for heatmap." },
      { method: "GET", path: "/api/v1/learn/failed-jobs", auth: "admin", description: "Failed GeneratedVideo rows with retry context." },
      { method: "POST", path: "/api/v1/learn/failed-jobs/retry", auth: "admin", description: "Retry a failed job with same params." },
      { method: "POST", path: "/api/v1/learn/undo-last", auth: "admin", description: "Reverse the most recent mutating action." },
    ],
  },
  {
    title: "Search",
    endpoints: [
      { method: "GET", path: "/api/v1/learn/search/global?q=...", auth: "admin", description: "Fulltext across scenes/guides/sources/chars/refs." },
    ],
  },
  {
    title: "Cron (internal)",
    endpoints: [
      { method: "GET", path: "/api/v1/learn/cron/daily-brain", auth: "admin", description: "Daily identity synthesis (06:00 UTC)." },
      { method: "GET", path: "/api/v1/learn/cron/retention", auth: "admin", description: "TTL enforcement (04:00 UTC)." },
      { method: "GET", path: "/api/v1/learn/cron/brain-from-rejections", auth: "admin", description: "Rejection patterns → upgrade proposals (06:30 UTC)." },
      { method: "GET", path: "/api/v1/learn/cron/eval", auth: "admin", description: "Golden prompt evaluation (Mon 07:00 UTC)." },
    ],
  },
  {
    title: "Health",
    endpoints: [
      { method: "GET", path: "/api/health", auth: "public", description: "Liveness: postgres + gemini + openai + blob. 200/503." },
    ],
  },
];

const METHOD_COLOR: Record<Endpoint["method"], string> = {
  GET: "bg-emerald-500/20 text-emerald-300",
  POST: "bg-amber-500/20 text-amber-300",
  PATCH: "bg-cyan-500/20 text-cyan-300",
  DELETE: "bg-rose-500/20 text-rose-300",
};

const AUTH_LABEL: Record<Endpoint["auth"], string> = {
  admin: "🔒 admin cookie/key",
  "api-key": "🔑 vexo_sk_*",
  public: "🌐 public",
};

export default function ApiIndexPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="ltr">
      <header dir="rtl">
        <h1 className="text-2xl font-bold text-slate-100">📚 API Index</h1>
        <p className="text-sm text-slate-400 mt-1">רשימת ה-endpoints העיקריים של vexo-studio. לתיעוד OpenAPI מלא — בהמשך.</p>
        <p className="text-xs text-slate-500 mt-2">
          <Link href="/admin/api-keys" className="text-cyan-400 hover:underline">לנהל vexo_sk_ keys</Link>
          {" · "}
          <Link href="/api/health" className="text-cyan-400 hover:underline">health status</Link>
        </p>
      </header>

      {GROUPS.map((g) => (
        <section key={g.title} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-cyan-300 mb-3" dir="rtl">{g.title}</h2>
          <ul className="space-y-2">
            {g.endpoints.map((e) => (
              <li key={e.path} className="bg-slate-950/60 rounded-lg p-3 font-mono text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${METHOD_COLOR[e.method]}`}>{e.method}</span>
                  <code className="text-slate-200 break-all">{e.path}</code>
                  <span className="text-[10px] text-slate-500 ms-auto">{AUTH_LABEL[e.auth]}</span>
                </div>
                <div className="mt-1.5 text-[11px] text-slate-400 font-sans" dir="rtl">{e.description}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
