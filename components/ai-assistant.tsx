"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { linkifyText } from "./learn/linkify";

type Citation = { id: string; title: string | null; score: number; url: string };
type Message = { id: string; role: "user" | "director"; content: string; action?: { type: string; [k: string]: unknown } | null; citations?: Citation[] };

const VALID_ACTION_TYPES = new Set([
  "compose_prompt",
  "generate_video",
  "import_guide_url",
  "ai_guide",
  "import_instagram_guide",
  "import_source",
  "update_reference",
  "create_episode",
  "update_episode",
  "create_scene",
  "update_scene",
  "update_opening_prompt",
  "ask_question",
  "estimate_cost",
  "search_memory",
  "extract_last_frame",
  "create_season",
  "delete_scene",
  "archive_episode",
  "generate_character_portrait",
  "revert_version",
  "queue_music_track",
  "queue_dubbing_track",
]);

type PageContext = { path: string; title: string; kind: string | null; id: string | null; label: string };

// Parse brain reply: extract action JSON + clean content.
// Tolerant to:
//   - fence with or without the "action" label
//   - 1/2/3 backticks (RTL-direction sometimes mangles the fence visually)
//   - raw JSON object embedded in prose
//   - trailing quote on numbers, trailing commas
// Always strips the source block from content so it never shows as raw text.
function parseBrainReply(raw: string): { content: string; action: { type: string; [k: string]: unknown } | null } {
  function tryParse(candidate: string): { type: string; [k: string]: unknown } | null {
    try {
      let s = candidate.trim().replace(/^json\s*/i, "").replace(/^action\s*/i, "");
      s = s.replace(/:(\s*-?\d+\.?\d*)"(\s*[,}])/g, ":$1$2");
      s = s.replace(/,(\s*[}\]])/g, "$1");
      const p = JSON.parse(s);
      if (p && typeof p.type === "string" && VALID_ACTION_TYPES.has(p.type)) return p;
    } catch {}
    return null;
  }

  // Pass 1: fenced block — use GREEDY match between first ``` and LAST ```
  // so long JSON with nested content doesn't get truncated by non-greedy [\s\S]*?.
  const fenceOpen = raw.indexOf("```");
  const fenceClose = raw.lastIndexOf("```");
  if (fenceOpen >= 0 && fenceClose > fenceOpen + 3) {
    let inner = raw.slice(fenceOpen + 3, fenceClose);
    inner = inner.replace(/^\s*(?:action|json)\s*\n?/, "");
    const parsed = tryParse(inner);
    if (parsed) {
      const before = raw.slice(0, fenceOpen).trim();
      const after = raw.slice(fenceClose + 3).trim();
      return { content: [before, after].filter(Boolean).join("\n").trim() || "(אין תגובה)", action: parsed };
    }
  }

  // Pass 2: hunt for JSON object with a known "type" field — use indexOf + bracket
  // matching instead of regex so nested braces don't break extraction.
  for (const t of VALID_ACTION_TYPES) {
    const needle = `"type":"${t}"`;
    const altNeedle = `"type": "${t}"`;
    let idx = raw.indexOf(needle);
    if (idx < 0) idx = raw.indexOf(altNeedle);
    if (idx < 0) continue;
    // Walk backwards to find the opening {
    let start = raw.lastIndexOf("{", idx);
    if (start < 0) continue;
    // Walk forwards with bracket counting to find matching }
    let depth = 0;
    let end = -1;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) continue;
    const candidate = raw.slice(start, end);
    const parsed = tryParse(candidate);
    if (parsed) {
      const cleaned = raw.slice(0, start).replace(/`+\s*(?:action|json)?\s*$/i, "").trim()
        + " " + raw.slice(end).replace(/^\s*`+/, "").trim();
      return { content: cleaned.trim() || "(אין תגובה)", action: parsed };
    }
  }

  return { content: raw, action: null };
}

function detectPageContext(): PageContext {
  if (typeof window === "undefined") return { path: "", title: "", kind: null, id: null, label: "" };
  const path = window.location.pathname;
  const docTitle = (document.title || "").replace(/\s*[·|]\s*vexo.*$/i, "").trim();

  const patterns: Array<{ re: RegExp; kind: string; labelHe: (m: RegExpMatchArray) => string }> = [
    { re: /^\/seasons\/([^\/]+)\/episodes\/([^\/]+)\/scenes\/([^\/]+)/, kind: "scene", labelHe: (m) => `סצנה ${m[3].slice(0, 8)} · פרק ${m[2].slice(0, 8)} · עונה ${m[1].slice(0, 8)}` },
    { re: /^\/seasons\/([^\/]+)\/episodes\/([^\/]+)/, kind: "episode", labelHe: (m) => `פרק ${m[2].slice(0, 8)} · עונה ${m[1].slice(0, 8)}` },
    { re: /^\/seasons\/([^\/]+)/, kind: "season", labelHe: (m) => `עונה ${m[1].slice(0, 8)}` },
    { re: /^\/characters\/([^\/]+)/, kind: "character", labelHe: (m) => `דמות ${m[1].slice(0, 8)}` },
    { re: /^\/learn\/guides\/([^\/]+)/, kind: "guide", labelHe: (m) => `מדריך: ${m[1]}` },
    { re: /^\/learn\/sources\/([^\/]+)/, kind: "source", labelHe: (m) => `מקור ${m[1].slice(0, 8)}` },
    { re: /^\/learn\/series/, kind: "series_dashboard", labelHe: () => "דשבורד סדרות" },
    { re: /^\/learn\/knowledge/, kind: "knowledge", labelHe: () => "ידע" },
    { re: /^\/learn\/brain\/upgrades/, kind: "brain_upgrades", labelHe: () => "שדרוגי מוח" },
    { re: /^\/learn\/compose/, kind: "compose", labelHe: () => "מחולל פרומפטים" },
  ];

  for (const p of patterns) {
    const m = path.match(p.re);
    if (m) return { path, title: docTitle, kind: p.kind, id: m[1] || null, label: p.labelHe(m) };
  }
  return { path, title: docTitle, kind: null, id: null, label: docTitle || path };
}

export function AiAssistant() {
  const lang = useLang(); const he = lang === "he";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("vexo-brain-chatId");
  });
  const [pageCtx, setPageCtx] = useState<PageContext>(() => detectPageContext());
  const [unread, setUnread] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const openRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function copyToClipboard(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch { /* clipboard blocked */ }
  }

  // Keep ref in sync so in-flight send() can check open-state at response time
  useEffect(() => { openRef.current = open; }, [open]);

  // Refresh context + clear unread badge when bubble opens (client-side nav
  // may have changed the URL; opening also means Oren has seen the answer).
  useEffect(() => {
    if (open) {
      setPageCtx(detectPageContext());
      setUnread(0);
    }
  }, [open]);

  // Persist chatId so bubble survives page refresh — same brain, same log
  useEffect(() => {
    if (chatId) localStorage.setItem("vexo-brain-chatId", chatId);
  }, [chatId]);

  // Load existing messages if we have a persisted chatId
  useEffect(() => {
    if (!chatId || messages.length > 0) return;
    api<{ chat?: { messages?: { id: string; role: string; content: string }[] } }>(`/api/v1/learn/brain/chats/${chatId}`)
      .then((r) => {
        const msgs = r.chat?.messages ?? [];
        if (msgs.length > 0) {
          setMessages(msgs.map((m) => {
            if (m.role === "user") return { id: m.id, role: "user" as const, content: m.content };
            return { id: m.id, role: "director" as const, ...parseBrainReply(m.content) };
          }));
        }
      })
      .catch(() => {});
  }, [chatId]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    setErr(null); setBusy(true);
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    if (!overrideText) setInput("");
    try {
      // Hit the migrated vexo-learn brain — same engine as /learn/brain/chat,
      // wired into the full DailyBrainCache + KnowledgeNode + Guide context.
      // It maintains the conversation server-side via chatId.
      const ctrl = new AbortController();
      // Server maxDuration is 60s. Give client the full window so the browser
      // abort never fires before the server times out — a server timeout returns
      // a friendly 504 with JSON, an abort throws "signal is aborted without reason".
      let timedOut = false;
      const t = setTimeout(() => { timedOut = true; ctrl.abort(); }, 62_000);
      let r: { reply?: string; chatId?: string; content?: string; citations?: Citation[] };
      try {
        r = await api<{ reply?: string; chatId?: string; content?: string; citations?: Citation[] }>("/api/v1/learn/brain/chat", {
          method: "POST",
          body: { message: text, chatId: chatId ?? undefined, pageContext: pageCtx },
          signal: ctrl.signal,
        });
      } catch (e) {
        if (timedOut) throw new Error(he
          ? "הבקשה לקחה יותר מדי זמן (מעל דקה). נסה שאלה קצרה יותר, או פצל לשלבים."
          : "Request took too long (>1min). Try a shorter question or break it into steps.");
        throw e;
      } finally { clearTimeout(t); }
      if (r.chatId && r.chatId !== chatId) setChatId(r.chatId);
      const reply = (r.reply ?? r.content ?? "").trim();
      const msgId = `b-${Date.now()}`;
      setMessages((m) => [...m, { id: msgId, role: "director", ...parseBrainReply(reply), citations: r.citations }]);
      // If Oren closed the bubble while we were waiting for the answer, flag
      // it so the launcher turns red and draws his attention back.
      if (!openRef.current) setUnread((n) => n + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  function clearChat() { setMessages([]); setErr(null); setChatId(null); localStorage.removeItem("vexo-brain-chatId"); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 end-6 w-14 h-14 rounded-full text-white text-2xl shadow-card flex items-center justify-center z-20 transition-colors ${
          unread > 0
            ? "bg-red-500 hover:bg-red-600 animate-pulse"
            : "bg-accent hover:bg-accent-light"
        }`}
        aria-label={unread > 0 ? `${unread} new AI Director messages` : "Open AI Director"}
        title={unread > 0 ? (he ? `${unread} הודעות חדשות מהבמאי` : `${unread} new messages`) : "AI Director"}
      >
        🎬
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[20px] h-5 px-1 bg-white text-red-600 text-[11px] font-bold rounded-full border-2 border-red-500 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-30 flex items-end justify-end p-6" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-bg-card rounded-card shadow-card border border-bg-main w-full max-w-md flex flex-col" style={{ maxHeight: "85vh", height: "85vh" }}>
            <div className="px-5 py-3 border-b border-bg-main flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">🎬 {he ? "במאי AI" : "AI Director"}</div>
                <div className="text-[11px] text-text-muted">{he ? "צ'אט במאי · Gemini" : "Director chat · Gemini"}</div>
              </div>
              <div className="flex items-center gap-2">
                <a href="/learn/brain/chat/logs" className="text-xs text-text-muted hover:text-accent" title={he ? "לוגים" : "Logs"}>📜</a>
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    className="text-[11px] bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-2 py-1 rounded font-semibold"
                    title={he ? "סיים שיחה ואפס" : "End chat & reset"}
                  >
                    🏁 {he ? "סיים שיחה" : "End chat"}
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
            </div>

            {/* Current page context — lets the brain know where Oren is working */}
            {pageCtx.label && (
              <div className="px-4 py-2 border-b border-bg-main bg-accent/5 flex items-center gap-2 text-[11px]">
                <span className="text-accent">📍</span>
                <span className="text-text-muted">{he ? "אתה נמצא ב:" : "You are on:"}</span>
                <span className="font-semibold text-text-primary truncate" title={pageCtx.path}>{pageCtx.label}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-text-muted text-sm py-8">
                  <div className="text-4xl mb-2">🎬</div>
                  <div>{he ? "אני הבמאי שלך — שאל אותי כל דבר על הסדרה" : "I'm your director — ask me anything about your series"}</div>
                  <div className="text-[11px] mt-2 text-text-muted/70">{he ? "לדוגמה: \"כתוב 3 כותרות לפרק על בריחה לחלל\"" : "e.g. \"write 3 episode titles about escape to space\""}</div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} group`}>
                  <div className={`relative max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-accent text-white" : "bg-bg-main text-text-primary"}`}>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(m.id, m.content)}
                      title={he ? "העתק" : "Copy"}
                      className={`absolute top-1 ${m.role === "user" ? "left-1" : "right-1"} opacity-0 group-hover:opacity-100 transition-opacity rounded-md w-6 h-6 flex items-center justify-center text-[11px] ${m.role === "user" ? "bg-white/20 hover:bg-white/30 text-white" : "bg-bg-card hover:bg-accent/10 text-text-muted hover:text-accent"}`}
                    >
                      {copiedId === m.id ? "✓" : "📋"}
                    </button>
                    {m.role === "director" ? linkifyText(m.content) : m.content}
                    {m.role === "director" && m.citations && m.citations.length > 0 && (
                      <CitationsBlock citations={m.citations} he={he} />
                    )}
                    {m.action?.type === "ask_question" ? (
                      <AskQuestionOptions action={m.action} he={he} onPick={(opt) => send(opt)} />
                    ) : m.action ? (
                      <>
                        <ConfidenceBadge action={m.action} he={he} />
                        <ExecuteActionButton
                          action={m.action}
                          chatId={chatId}
                          pageCtx={pageCtx}
                          he={he}
                          onResult={(text, url) => {
                            const link = url ? `\n🔗 ${url.startsWith("http") ? url : `https://vexo-studio.vercel.app${url}`}` : "";
                            setMessages((msgs) => [
                              ...msgs,
                              { id: `exec-${Date.now()}`, role: "director", content: `✅ ${text || "בוצע"}${link}` },
                            ]);
                          }}
                          onError={(msg) => setErr(msg)}
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="bg-bg-main rounded-2xl px-3 py-2 text-sm text-text-muted">{he ? "חושב…" : "Thinking…"}</div>
                </div>
              )}
              {err && (
                <div data-no-translate className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400 whitespace-pre-wrap break-words" style={{ minHeight: "40px" }}>
                  ⚠ <span data-no-translate>{err || "(empty error)"}</span>
                  <div className="text-[10px] text-red-300 mt-1 opacity-60">len={err?.length || 0}</div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="px-3 py-2 border-t border-bg-main flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={2}
                placeholder={he ? "שאל את הבמאי… (Enter לשליחה)" : "Ask the director… (Enter to send)"}
                className="flex-1 px-3 py-2 rounded-lg border border-bg-main text-sm resize-none"
                disabled={busy}
              />
              <button
                onClick={() => send()}
                disabled={busy || !input.trim()}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "…" : (he ? "שלח" : "Send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExecuteActionButton({
  action,
  chatId,
  pageCtx,
  he,
  onResult,
  onError,
}: {
  action: { type: string; [k: string]: unknown };
  chatId: string | null;
  pageCtx: PageContext;
  he: boolean;
  onResult: (text: string, url?: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    if (busy || done) return;
    setBusy(true);
    try {
      const r = await api<{ text?: string; url?: string; error?: string; aborted?: boolean }>(
        "/api/v1/learn/brain/chat/execute",
        { method: "POST", body: { action, chatId, pageContext: pageCtx } },
      );
      if (r.aborted) {
        onError(r.error || (he ? "הפעולה בוטלה — ביטחון נמוך" : "Aborted — low confidence"));
      } else {
        setDone(true);
        onResult(r.text || "", r.url);
      }
    } catch (e: any) {
      // Try multiple fields — vexo api wrapper populates .message/.error/.statusCode
      const msg = e?.error || e?.message || e?.statusText || String(e);
      const status = e?.statusCode ? ` [${e.statusCode}]` : "";
      onError(msg + status);
    } finally {
      setBusy(false);
    }
  }

  const label = action.type.replace(/_/g, " ");
  return (
    <button
      onClick={run}
      disabled={busy || done}
      type="button"
      className={`mt-2 w-full text-[12px] px-3 py-2 rounded-lg font-semibold border transition ${
        done
          ? "bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default"
          : busy
          ? "bg-status-okBg text-status-okText border-status-okText/30 opacity-60 cursor-wait"
          : "bg-status-okBg hover:bg-status-okBg/80 text-status-okText border-status-okText/40 hover:border-status-okText cursor-pointer"
      }`}
      style={{ pointerEvents: done ? "none" : "auto" }}
    >
      {done
        ? `✓ ${he ? "בוצע" : "Done"}`
        : busy
        ? `⏳ ${he ? "מבצע…" : "Running…"} ${label}`
        : `✅ ${he ? "אשר ובצע" : "Confirm & Execute"}: ${label}`}
    </button>
  );
}

function ConfidenceBadge({ action, he }: { action: { [k: string]: unknown }; he: boolean }) {
  const c = typeof action.confidence === "number" ? action.confidence : null;
  if (c === null) return null;
  const pct = Math.round(c * 100);
  const { icon, cls, label } = c >= 0.85
    ? { icon: "🟢", cls: "bg-emerald-100 text-emerald-700 border-emerald-300", label: he ? "בטוח" : "Confident" }
    : c >= 0.65
    ? { icon: "🟡", cls: "bg-amber-100 text-amber-700 border-amber-300", label: he ? "חלקית בטוח" : "Partial" }
    : { icon: "🔴", cls: "bg-red-100 text-red-700 border-red-300", label: he ? "לא בטוח" : "Low" };
  return (
    <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`} title={he ? `ביטחון המוח בפעולה: ${pct}%` : `Brain confidence: ${pct}%`}>
      {icon} {label} · {pct}%
    </div>
  );
}

function CitationsBlock({ citations, he }: { citations: Citation[]; he: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 text-[10px] opacity-70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-text-muted hover:text-accent underline-offset-2 hover:underline"
      >
        {open ? "▼" : "▶"} {he ? `מקורות השפעה (${citations.length})` : `Sources (${citations.length})`}
      </button>
      {open && (
        <ol className="mt-1.5 space-y-1 pl-4 pr-1">
          {citations.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              <span className="text-accent font-mono">[{Math.round(c.score * 100)}%]</span>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate max-w-[220px]">
                {c.title || c.id.slice(-8)}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AskQuestionOptions({
  action,
  he,
  onPick,
}: {
  action: { [k: string]: unknown };
  he: boolean;
  onPick: (text: string) => void;
}) {
  const rawOpts = Array.isArray(action.options) ? (action.options as unknown[]) : [];
  const opts = rawOpts
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 5);
  if (opts.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {opts.map((opt, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(opt)}
          className="text-[12px] px-3 py-1.5 rounded-full border border-accent/40 bg-accent/5 hover:bg-accent/15 text-accent font-semibold transition"
        >
          {opt}
        </button>
      ))}
      <span className="text-[10px] text-text-muted self-center">{he ? "(או הקלד תשובה משלך)" : "(or type your own)"}</span>
    </div>
  );
}
