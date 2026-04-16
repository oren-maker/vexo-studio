"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { linkifyText } from "./learn/linkify";

type Message = { id: string; role: "user" | "director"; content: string; action?: { type: string; [k: string]: unknown } | null };

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
      s = s.replace(/:(\s*-?\d+\.?\d*)"(\s*[,}])/g, ":$1$2"); // "0.98" → 0.98
      s = s.replace(/,(\s*[}\]])/g, "$1"); // trailing commas
      const p = JSON.parse(s);
      if (p && typeof p.type === "string" && VALID_ACTION_TYPES.has(p.type)) return p;
    } catch {}
    return null;
  }

  // Pass 1: standard fenced block ```action ... ``` (or ```json or plain ```).
  let match = raw.match(/```+\s*(?:action|json)?\s*\n?([\s\S]*?)\n?```+/);
  if (match) {
    const parsed = tryParse(match[1]);
    return { content: raw.replace(match[0], "").trim() || "(אין תגובה)", action: parsed };
  }

  // Pass 2: look for a single-backtick-wrapped or unfenced JSON with "type":"<known>"
  // so if the brain/RTL mangled the triple backticks we still recover.
  const jsonHunt = raw.match(/\{[\s\S]*?"type"\s*:\s*"(?:compose_prompt|generate_video|import_guide_url|ai_guide|import_instagram_guide|import_source|update_reference|create_episode|update_episode|create_scene|update_scene|update_opening_prompt)"[\s\S]*?\}/);
  if (jsonHunt) {
    const parsed = tryParse(jsonHunt[0]);
    if (parsed) {
      // Strip the JSON + any stray surrounding backticks from visible content
      const cleaned = raw.replace(jsonHunt[0], "").replace(/`+\s*action\s*/gi, "").replace(/`+/g, "").trim();
      return { content: cleaned || "(אין תגובה)", action: parsed };
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
  const openRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

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

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setErr(null); setBusy(true);
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
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
      let r: { reply?: string; chatId?: string; content?: string };
      try {
        r = await api<{ reply?: string; chatId?: string; content?: string }>("/api/v1/learn/brain/chat", {
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
      setMessages((m) => [...m, { id: msgId, role: "director", ...parseBrainReply(reply) }]);
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
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-accent text-white" : "bg-bg-main text-text-primary"}`}>
                    {m.role === "director" ? linkifyText(m.content) : m.content}
                    {m.action && (
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
                    )}
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
                onClick={send}
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
