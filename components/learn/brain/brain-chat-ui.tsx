"use client";
import { learnFetch } from "@/lib/learn/fetch";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adminHeaders } from "@/lib/learn/admin-key";

type Citation = { id: string; title: string | null; score: number; url: string };
type Message = { id: string; role: "user" | "brain"; content: string; createdAt?: string; citations?: Citation[] };

type ParsedAction = { action: any; raw: string };
function parseAction(text: string): { stripped: string; action: ParsedAction | null } {
  const re = /```action\s*([\s\S]*?)```/;
  const m = text.match(re);
  if (!m) return { stripped: text, action: null };
  try {
    const action = JSON.parse(m[1].trim());
    return { stripped: text.replace(re, "").trim(), action: { action, raw: m[1].trim() } };
  } catch {
    return { stripped: text, action: null };
  }
}

function actionLabel(action: any): string {
  switch (action.type) {
    case "compose_prompt": return `✨ צור פרומפט וידאו חדש`;
    case "generate_video": return `🎬 צור סרטון VEO`;
    case "import_guide_url": return `📥 ייבא מדריך מ-URL`;
    case "ai_guide": return `🤖 צור מדריך AI`;
    case "import_instagram_guide": return `📷 ייבא פוסט Instagram כמדריך`;
    case "import_source": return `➕ ייבא פוסט כמקור פרומפט`;
    case "ask_question": return `❓ שאלה למילוי`;
    case "estimate_cost": return `💰 הערכת עלות (dry-run)`;
    case "search_memory": return `🔍 חיפוש בספרייה`;
    case "extract_last_frame": return `🖼️ שליפת frame אחרון`;
    case "create_season": return `📂 צור עונה חדשה`;
    case "delete_scene": return `🗑️ מחק סצנה (DRAFT בלבד)`;
    case "archive_episode": return `📦 ארכב פרק`;
    case "generate_character_portrait": return `🎨 פורטרט לדמות`;
    case "revert_version": return `⏪ שחזור גרסה`;
    case "queue_music_track": return `🎵 רישום track מוזיקה`;
    case "queue_dubbing_track": return `🗣️ רישום dubbing`;
    default: return `⚡ ${action.type}`;
  }
}

function CitationsBlock({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 text-[10px] opacity-70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-slate-400 hover:text-cyan-300"
      >
        {open ? "▼" : "▶"} מקורות השפעה ({citations.length})
      </button>
      {open && (
        <ol className="mt-1.5 space-y-1 pl-4 pr-1">
          {citations.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              <span className="text-cyan-300 font-mono">[{Math.round(c.score * 100)}%]</span>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline truncate max-w-[220px]">
                {c.title || c.id.slice(-8)}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function confidenceBadge(action: any): { icon: string; label: string; cls: string; pct: number } | null {
  const c = typeof action?.confidence === "number" ? action.confidence : null;
  if (c === null) return null;
  const pct = Math.round(c * 100);
  if (c >= 0.85) return { icon: "🟢", label: "בטוח", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", pct };
  if (c >= 0.65) return { icon: "🟡", label: "חלקית", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", pct };
  return { icon: "🔴", label: "לא בטוח", cls: "bg-red-500/15 text-red-300 border-red-500/40", pct };
}

function actionDetail(action: any): string {
  if (action.url) return action.url;
  if (action.topic) return `"${action.topic}"`;
  if (action.brief) return `"${action.brief}"`;
  if (action.sourceId) return `מקור: ${action.sourceId.slice(-8)}`;
  return "";
}

const ACTION_STAGES: Record<string, string[]> = {
  compose_prompt: [
    "🔍 מחפש 5 פרומפטים רפרנס בספרייה...",
    "🧠 Gemini מייצר פרומפט מלא (8 סעיפים)...",
    "📝 מרכיב Visual Style + Lens + Color + Lighting...",
    "🎭 מוסיף Character + Audio + Timeline...",
    "💾 שומר ל-LearnSource ב-DB...",
  ],
  ai_guide: [
    "🧠 Gemini מייצר מבנה מדריך (4-6 שלבים)...",
    "📝 כותב תוכן לכל שלב...",
    "💾 שומר ל-Guide ב-DB...",
    "🌐 תרגום אוטומטי לעברית רץ ברקע...",
  ],
  import_guide_url: [
    "🔗 מושך את ה-URL...",
    "🔍 חולץ title + headings + paragraphs + images...",
    "📝 ממפה לשלבי מדריך...",
    "💾 שומר ל-Guide ב-DB...",
  ],
  import_instagram_guide: [
    "📷 מושך את הפוסט מ-Instagram (embed API)...",
    "📝 ממיר caption + thumbnail לשלב...",
    "💾 שומר ל-Guide ב-DB...",
  ],
  import_source: [
    "➕ יוצר LearnSource...",
    "🔄 מפעיל pipeline ברקע (extract → analyze → prompt)...",
    "💾 הפרומפט יופיע בדקה הקרובה...",
  ],
  generate_video: [
    "🎬 שולח פרומפט ל-VEO 3.1...",
    "⏳ VEO מייצר סרטון (1-2 דקות)...",
    "📥 מוריד קובץ MP4...",
    "💾 שומר ל-Vercel Blob + GeneratedVideo...",
  ],
  estimate_cost: [
    "💰 מחשב תעריף ליחידה...",
    "🧮 מכפיל במשך המבוקש...",
    "📊 מחזיר הערכה (ללא חיוב)...",
  ],
  search_memory: [
    "🔍 embedding של ה-query...",
    "📚 סריקה סמנטית מעל 500 מקורות...",
    "📊 מיון לפי דמיון + סינון סף 40%...",
  ],
  extract_last_frame: [
    "🎞️ קריאת memoryContext של הסצנה...",
    "🖼️ החזרת bridgeFrameUrl או הנחיה לאישור...",
  ],
  create_season: [
    "📂 שולף את הסדרה מה-DB...",
    "🔢 מחשב seasonNumber הבא...",
    "💾 שומר Season + מעדכן totalSeasons...",
  ],
  delete_scene: [
    "🔒 מאמת status=DRAFT...",
    "📝 שומר snapshot ב-SceneLog...",
    "🗑️ מוחק מה-DB...",
  ],
  archive_episode: [
    "📦 משנה status → ARCHIVED...",
    "💾 שומר ב-Episode...",
  ],
  generate_character_portrait: [
    "👤 שולף appearance + personality של הדמות...",
    "📝 בונה פרומפט תמונה מובנה...",
    "🎨 nano-banana/imagen מייצר תמונה...",
    "💾 שומר ל-Vercel Blob + CharacterMedia...",
  ],
  revert_version: [
    "🔍 שולף את הגרסה המבוקשת מהסנאפשוט...",
    "💾 שומר את הגרסה הנוכחית לפני החלפה...",
    "⏪ מחליף ל-scriptText/prompt הישן...",
  ],
  queue_music_track: [
    "🎵 רושם MusicTrack בסטטוס REQUESTED...",
    "💾 מחכה לספק מוזיקה (עתידי)...",
  ],
  queue_dubbing_track: [
    "🗣️ רושם DubbingTrack לשפה המבוקשת...",
    "💾 status=REQUESTED — מחכה לצוות דיבוב...",
  ],
};

export default function BrainChatUI({ initialChatId }: { initialChatId?: string }) {
  const router = useRouter();
  // Share chatId with the floating bubble (`AiAssistant`) via the same
  // localStorage key so opening either surface shows the same conversation.
  const [chatId, setChatId] = useState<string | undefined>(() => {
    if (initialChatId) return initialChatId;
    if (typeof window === "undefined") return undefined;
    return localStorage.getItem("vexo-brain-chatId") ?? undefined;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (chatId) localStorage.setItem("vexo-brain-chatId", chatId);
  }, [chatId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executingStage, setExecutingStage] = useState<number>(0);
  const [executingStages, setExecutingStages] = useState<string[]>([]);
  const [executed, setExecuted] = useState<Record<string, { text: string; url: string | null }>>({});
  const [pendingUpgrades, setPendingUpgrades] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function copyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch { /* clipboard blocked */ }
  }

  useEffect(() => {
    learnFetch("/api/v1/learn/brain/upgrades").then((r) => r.json()).then((d) => {
      const items = d.upgrades ?? d.items ?? [];
      setPendingUpgrades(items.filter((u: any) => u.status === "pending" || u.status === "in-progress").length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!chatId) return;
    learnFetch(`/api/v1/learn/brain/chats/${chatId}`, { headers: adminHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d.chat?.messages) setMessages(d.chat.messages);
      });
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function executeAction(messageId: string, action: any) {
    setExecutingId(messageId);
    setError(null);
    const stages = ACTION_STAGES[action.type] || ["⏳ מבצע..."];
    setExecutingStages(stages);
    setExecutingStage(0);
    const stageInterval = setInterval(() => {
      setExecutingStage((s) => Math.min(s + 1, stages.length - 1));
    }, action.type === "generate_video" ? 18000 : 4000);
    try {
      const res = await learnFetch("/api/v1/learn/brain/chat/execute", {
        method: "POST",
        headers: adminHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action, chatId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setExecuted((e) => ({ ...e, [messageId]: { text: data.text || "✅ בוצע", url: data.url || null } }));
      if (data.text) {
        setMessages((m) => [...m, { id: `exec-${Date.now()}`, role: "brain", content: `${data.text}${data.url ? `\n🔗 ${data.url}` : ""}` }]);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      clearInterval(stageInterval);
      setExecutingId(null);
      setExecutingStage(0);
      setExecutingStages([]);
    }
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setError(null);
    setLoading(true);
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content: text }]);
    if (!overrideText) setInput("");
    try {
      const res = await learnFetch("/api/v1/learn/brain/chat", {
        method: "POST",
        headers: adminHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ chatId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!chatId) setChatId(data.chatId);
      setMessages((m) => [...m, { id: data.messageId, role: "brain", content: data.reply, citations: data.citations }]);
    } catch (e: any) {
      setError(String(e?.message || e));
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-xs text-slate-400">
          {chatId ? `שיחה: ${chatId.slice(-8)}` : "שיחה חדשה"}
        </div>
        <div className="flex gap-2">
          <Link
            href="/learn/brain/chat/logs"
            className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-3 py-1.5 rounded"
          >
            📂 לוגי שיחות
          </Link>
          {chatId && (
            <button
              onClick={() => {
                setChatId(undefined);
                setMessages([]);
              }}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded"
            >
              ✨ שיחה חדשה
            </button>
          )}
          <Link
            href="/learn/brain/upgrades"
            className="text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded font-semibold"
          >
            ⬆️ שדרוגים{pendingUpgrades > 0 && ` (${pendingUpgrades})`}
          </Link>
          <button
            onClick={() => router.push("/learn/brain")}
            className="text-xs bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded font-semibold"
          >
            🏁 סיים שיחה
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-8">
            דבר עם המוח. שאל שאלה, תן משוב, או הצע כיוון.
          </div>
        )}
        {messages.map((m) => {
          const { stripped, action } = m.role === "brain" ? parseAction(m.content) : { stripped: m.content, action: null };
          const done = executed[m.id];
          return (
            <div
              key={m.id}
              className={`flex group ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`relative max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-50"
                    : "bg-purple-500/10 border border-purple-500/30 text-slate-100"
                }`}
              >
                <button
                  type="button"
                  onClick={() => copyMessage(m.id, stripped)}
                  title="העתק"
                  className={`absolute top-1 ${m.role === "user" ? "left-1" : "right-1"} opacity-0 group-hover:opacity-100 transition-opacity rounded-md w-6 h-6 flex items-center justify-center text-[11px] bg-slate-900/60 hover:bg-amber-500/30 text-slate-300 hover:text-amber-200`}
                >
                  {copiedId === m.id ? "✓" : "📋"}
                </button>
                <div className="text-[10px] uppercase mb-1 opacity-60">
                  {m.role === "user" ? "את/ה" : "🧠 המוח"}
                </div>
                {stripped}
                {m.role === "brain" && m.citations && m.citations.length > 0 && (
                  <CitationsBlock citations={m.citations} />
                )}
                {action && !done && action.action.type === "ask_question" && (
                  <div className="mt-3 bg-slate-950/60 border border-cyan-500/40 rounded-xl p-3">
                    <div className="text-xs font-semibold text-cyan-300 mb-2">❓ לחץ על אחת או הקלד תשובה משלך</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Array.isArray(action.action.options) ? action.action.options : [])
                        .filter((o: unknown): o is string => typeof o === "string" && o.trim().length > 0)
                        .slice(0, 5)
                        .map((opt: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setExecuted((e) => ({ ...e, [m.id]: { text: `נבחר: ${opt}`, url: null } }));
                              send(opt);
                            }}
                            className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 font-semibold"
                          >
                            {opt}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                {action && !done && action.action.type !== "ask_question" && (
                  <div className="mt-3 bg-slate-950/60 border border-amber-500/40 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <div className="text-xs font-semibold text-amber-300">{actionLabel(action.action)}</div>
                      {(() => {
                        const b = confidenceBadge(action.action);
                        return b ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${b.cls}`} title={`ביטחון: ${b.pct}%`}>
                            {b.icon} {b.label} · {b.pct}%
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="text-[11px] text-slate-400 mb-2 break-all">{actionDetail(action.action)}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => executeAction(m.id, action.action)}
                        disabled={executingId === m.id}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-semibold text-xs px-3 py-1.5 rounded"
                      >
                        {executingId === m.id ? "⏳ מבצע..." : "✅ אשר ובצע"}
                      </button>
                      <button
                        onClick={() => {
                          setExecuted((e) => ({ ...e, [m.id]: { text: "בוטל", url: null } }));
                          // Log calibration rejection so ECE reflects reality, not just accepts.
                          learnFetch("/api/v1/learn/brain/chat/outcome", {
                            method: "POST",
                            headers: adminHeaders({ "content-type": "application/json" }),
                            body: JSON.stringify({
                              chatId,
                              actionType: action.action.type,
                              confidence: typeof action.action.confidence === "number" ? action.action.confidence : null,
                              outcome: "rejected",
                            }),
                          }).catch(() => {});
                        }}
                        disabled={executingId === m.id}
                        className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 text-xs px-3 py-1.5 rounded"
                      >
                        ❌ ביטול
                      </button>
                    </div>
                    {executingId === m.id && executingStages.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {executingStages.map((stage, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-2 text-[11px] transition ${
                              i < executingStage ? "text-emerald-400" :
                              i === executingStage ? "text-amber-300 font-semibold" :
                              "text-slate-600"
                            }`}
                          >
                            <span className="w-3 text-center">
                              {i < executingStage ? "✓" : i === executingStage ? "⏳" : "○"}
                            </span>
                            <span>{stage}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {done && (
                  <div className="mt-3 bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-3 text-xs">
                    <div className="text-emerald-300 font-semibold">{done.text}</div>
                    {done.url && (
                      <a href={done.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline mt-1 inline-block">
                        פתח ←
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-purple-500/10 border border-purple-500/30 px-4 py-2.5 rounded-2xl text-sm text-slate-400">
              🧠 חושב...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="כתוב למוח... (Enter לשליחה, Shift+Enter לשורה חדשה)"
          rows={2}
          className="flex-1 bg-slate-900 border border-slate-700 focus:border-cyan-500/60 rounded-xl px-4 py-3 text-sm text-slate-100 resize-none outline-none"
          disabled={loading}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold px-5 rounded-xl text-sm"
        >
          שלח
        </button>
      </div>
    </div>
  );
}
