"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Message = { id: string; role: "user" | "brain"; content: string };

export function AiAssistant() {
  const lang = useLang(); const he = lang === "he";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setErr(null); setBusy(true);
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    try {
      // Compose a brain-style system context from the last 6 messages so the
      // chat feels conversational (the /generate route is stateless).
      const ctx = [...messages, userMsg].slice(-6).map((m) =>
        m.role === "user" ? `USER: ${m.content}` : `BRAIN: ${m.content}`,
      ).join("\n\n");
      const sys = he
        ? "אתה 'המוח' של vexo-studio — עוזר חכם וקצר לבמאי AI שמייצר סדרות. ענה בעברית, תכליתי, עם המלצות מעשיות. אם אתה לא בטוח — שאל. אל תנפח."
        : "You are vexo-studio's 'Brain' — a sharp short assistant for an AI series director. Answer briefly with concrete recommendations. If unsure, ask. Don't pad.";
      // Hard 55s client-side timeout so the UI never gets stuck on "thinking…"
      // even if the function silently dies upstream.
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 55_000);
      let r: { content: string };
      try {
        r = await api<{ content: string }>("/api/v1/ai/generate", {
          method: "POST",
          body: { prompt: `${sys}\n\nשיחה עד עכשיו:\n${ctx}\n\nתשובת המוח:`, maxTokens: 1200 },
          signal: ctrl.signal,
        });
      } finally { clearTimeout(t); }
      setMessages((m) => [...m, { id: `b-${Date.now()}`, role: "brain", content: r.content.trim() }]);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  function clearChat() { setMessages([]); setErr(null); }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 end-6 w-14 h-14 rounded-full bg-accent text-white text-2xl shadow-card hover:bg-accent-light flex items-center justify-center z-20"
        aria-label="Open Brain"
        title="Brain Chat"
      >
        🧠
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-30 flex items-end justify-end p-6" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-bg-card rounded-card shadow-card border border-bg-main w-full max-w-md flex flex-col" style={{ maxHeight: "85vh", height: "85vh" }}>
            <div className="px-5 py-3 border-b border-bg-main flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">🧠 {he ? "מוח" : "Brain"}</div>
                <div className="text-[11px] text-text-muted">{he ? "צ'אט עוזר · Gemini" : "Assistant chat · Gemini"}</div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && <button onClick={clearChat} className="text-xs text-text-muted hover:text-status-errText" title={he ? "נקה צ'אט" : "Clear chat"}>🗑</button>}
                <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-text-muted text-sm py-8">
                  <div className="text-4xl mb-2">🧠</div>
                  <div>{he ? "שאל אותי כל דבר על הסדרה" : "Ask me anything about your series"}</div>
                  <div className="text-[11px] mt-2 text-text-muted/70">{he ? "לדוגמה: \"כתוב 3 כותרות לפרק על בריחה לחלל\"" : "e.g. \"write 3 episode titles about escape to space\""}</div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-accent text-white" : "bg-bg-main text-text-primary"}`}>
                    {m.content}
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
                placeholder={he ? "שאל את המוח… (Enter לשליחה)" : "Ask the brain… (Enter to send)"}
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
