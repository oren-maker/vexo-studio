"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Message = { id: string; role: "user" | "director"; content: string; action?: { type: string; [k: string]: unknown } | null };

type PageContext = { path: string; title: string; kind: string | null; id: string | null; label: string };

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
  const endRef = useRef<HTMLDivElement>(null);

  // Refresh context when bubble opens (client-side navigation may have changed the URL)
  useEffect(() => {
    if (open) setPageCtx(detectPageContext());
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
        if (msgs.length > 0) setMessages(msgs.map((m) => ({ id: m.id, role: m.role === "user" ? "user" : "director", content: m.content })));
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
      const t = setTimeout(() => ctrl.abort(), 55_000);
      let r: { reply?: string; chatId?: string; content?: string };
      try {
        r = await api<{ reply?: string; chatId?: string; content?: string }>("/api/v1/learn/brain/chat", {
          method: "POST",
          body: { message: text, chatId: chatId ?? undefined, pageContext: pageCtx },
          signal: ctrl.signal,
        });
      } finally { clearTimeout(t); }
      if (r.chatId && r.chatId !== chatId) setChatId(r.chatId);
      const reply = (r.reply ?? r.content ?? "").trim();
      // Parse action blocks from the brain's reply (```action ... ```)
      const actionMatch = reply.match(/```action\s*([\s\S]*?)```/);
      let cleanReply = reply;
      let action: { type: string; [k: string]: unknown } | null = null;
      if (actionMatch) {
        try { action = JSON.parse(actionMatch[1].trim()); } catch {}
        cleanReply = reply.replace(/```action[\s\S]*?```/, "").trim();
      }
      const msgId = `b-${Date.now()}`;
      setMessages((m) => [...m, { id: msgId, role: "director", content: cleanReply || "(אין תגובה)", action }]);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  function clearChat() { setMessages([]); setErr(null); setChatId(null); localStorage.removeItem("vexo-brain-chatId"); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 end-6 w-14 h-14 rounded-full bg-accent text-white text-2xl shadow-card hover:bg-accent-light flex items-center justify-center z-20"
        aria-label="Open AI Director"
        title="AI Director"
      >
        🎬
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
                {messages.length > 0 && <button onClick={clearChat} className="text-xs text-text-muted hover:text-status-errText" title={he ? "שיחה חדשה" : "New chat"}>✨</button>}
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
                    {m.content}
                    {m.action && (
                      <button
                        onClick={async () => {
                          try {
                            const r = await api<{ text?: string; url?: string }>("/api/v1/learn/brain/chat/execute", {
                              method: "POST",
                              body: { action: m.action, chatId, pageContext: pageCtx },
                            });
                            const result = [r.text, r.url].filter(Boolean).join("\n🔗 ");
                            setMessages((msgs) => [...msgs, { id: `exec-${Date.now()}`, role: "director", content: `✅ ${result || "בוצע"}` }]);
                          } catch (e) { setErr((e as Error).message); }
                        }}
                        className="mt-2 w-full text-[11px] px-3 py-1.5 rounded-lg bg-status-okBg text-status-okText font-semibold border border-status-okText/30"
                      >
                        ✅ {he ? "אשר ובצע" : "Confirm & Execute"}: {m.action.type.replace(/_/g, " ")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="bg-bg-main rounded-2xl px-3 py-2 text-sm text-text-muted">{he ? "חושב…" : "Thinking…"}</div>
                </div>
              )}
              {err && <div className="text-status-errText text-xs">⚠ {err}</div>}
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
