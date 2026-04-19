"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { CheatSheet } from "@/components/cheat-sheet";

// Command palette — Cmd/Ctrl+K anywhere in vexo-studio.
// Rule-based parser (no LLM call) for instant response on common intents.
// Free-form input that doesn't match any rule falls through to the brain bubble.

type Command = {
  id: string;
  label: string;
  hint?: string;
  run: () => void | Promise<void>;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isPaletteToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isPaletteToggle) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (open && e.key === "Escape") { setOpen(false); setQuery(""); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQuery(""); setActiveIdx(0); }
  }, [open]);

  const commands = buildCommands(query, pathname ?? "", router);

  useEffect(() => { setActiveIdx(0); }, [query]);

  function runActive() {
    const cmd = commands[activeIdx];
    if (!cmd) return;
    cmd.run();
    setOpen(false);
  }

  if (!open) return <CheatSheet />;

  return (
    <>
    <CheatSheet />
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center pt-[15vh] px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl bg-bg-card border border-bg-main rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-bg-main px-4">
          <span className="text-text-muted text-sm me-2">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, commands.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); runActive(); }
            }}
            placeholder="נווט או בקש פעולה… (scene 5, new episode, knowledge, …)"
            className="flex-1 bg-transparent py-3 text-sm outline-none"
          />
          <span className="text-[10px] text-text-muted">Esc</span>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {commands.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-text-muted">אין התאמה. נסה: scene 3 · new episode · knowledge</li>
          )}
          {commands.map((c, i) => (
            <li
              key={c.id}
              onClick={() => { c.run(); setOpen(false); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-4 py-2 cursor-pointer flex items-center justify-between text-sm ${i === activeIdx ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-bg-main"}`}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-[10px] text-text-muted">{c.hint}</span>}
            </li>
          ))}
        </ul>

        <div className="border-t border-bg-main px-4 py-1.5 flex items-center gap-3 text-[10px] text-text-muted">
          <span>↑↓ ניווט</span>
          <span>↵ בצע</span>
          <span className="ms-auto">⌘K לפתיחה/סגירה · ? לקיצורים</span>
        </div>
      </div>
    </div>
    </>
  );
}

type Router = ReturnType<typeof useRouter>;

function buildCommands(raw: string, currentPath: string, router: Router): Command[] {
  const q = raw.trim().toLowerCase();

  // Extract a numeric arg for "scene N"/"episode N" intents
  const numMatch = q.match(/\b(\d+)\b/);
  const num = numMatch ? Number(numMatch[1]) : null;

  const seen = new Set<string>();
  const out: Command[] = [];

  function add(c: Command) {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    out.push(c);
  }

  // Derive current episode/season from URL if we're in production context
  const epMatch = currentPath.match(/\/episodes\/([^\/]+)/) ?? currentPath.match(/\/seasons\/[^\/]+\/episodes\/([^\/]+)/);
  const currentEpisodeId = epMatch?.[1];
  const seasonMatch = currentPath.match(/\/seasons\/([^\/]+)/);
  const currentSeasonId = seasonMatch?.[1];

  // === Navigation intents ===
  if (/scene|סצנה/.test(q) && num != null && currentEpisodeId) {
    add({
      id: `scene-jump-${num}`,
      label: `🎬 עבור לסצנה ${num} בפרק הנוכחי`,
      hint: "scene N",
      run: async () => {
        try {
          const res = await fetch(`/api/v1/episodes/${currentEpisodeId}/scenes`, { credentials: "include" });
          const list = await res.json();
          const match = Array.isArray(list) ? list.find((s: { sceneNumber: number }) => s.sceneNumber === num) : null;
          if (match) router.push(`/scenes/${match.id}`);
          else alert(`לא נמצאה סצנה ${num} בפרק`);
        } catch { alert("שגיאה בשליפת הסצנות"); }
      },
    });
  }
  if (/knowledge|ידע/.test(q)) add({ id: "nav-knowledge", label: "📚 ידע", hint: "/learn/knowledge", run: () => router.push("/learn/knowledge") });
  if (/brain|מוח|בדיר/.test(q) || q === "") add({ id: "nav-brain", label: "🧠 מוח — בית", hint: "/learn/brain", run: () => router.push("/learn/brain") });
  if (/chat|צ'?אט|שיחה/.test(q) || q === "") add({ id: "nav-brain-chat", label: "💬 צ'אט עם הבמאי", hint: "/learn/brain/chat", run: () => router.push("/learn/brain/chat") });
  if (/insights|תובנות/.test(q)) add({ id: "nav-insights", label: "📊 תובנות", hint: "/learn/insights", run: () => router.push("/learn/insights") });
  if (/consciousness|תודעה/.test(q)) add({ id: "nav-consciousness", label: "🌀 תודעה", hint: "/learn/consciousness", run: () => router.push("/learn/consciousness") });
  if (/tokens|טוקנים/.test(q)) add({ id: "nav-tokens", label: "💰 צריכת טוקנים", hint: "/learn/tokens", run: () => router.push("/learn/tokens") });
  if (/cost|עלות|עלויות/.test(q)) add({ id: "nav-costs", label: "💰 לוח עלויות", hint: "/learn/costs", run: () => router.push("/learn/costs") });
  if (/failed|נכשל|retry|רטריי/.test(q)) add({ id: "nav-failed", label: "💥 עבודות שנכשלו", hint: "/learn/failed-jobs", run: () => router.push("/learn/failed-jobs") });
  if (/preset|תבנית|תבניות/.test(q)) add({ id: "nav-presets", label: "📚 תבניות פרומפט", hint: "/learn/presets", run: () => router.push("/learn/presets") });
  if (/search|חיפוש|חפש/.test(q)) add({ id: "nav-search", label: "🔍 חיפוש גלובלי", hint: "/learn/search/all", run: () => router.push(`/learn/search/all?q=${encodeURIComponent(raw)}`) });
  if (/activity|פעילות|heatmap/.test(q)) add({ id: "nav-activity", label: "📅 פעילות (heatmap)", hint: "/learn/activity", run: () => router.push("/learn/activity") });
  if (/inspect|prompt|פרומפט|אינספ/.test(q)) add({ id: "nav-last-prompt", label: "🔎 System Prompt Inspector", hint: "/learn/brain/last-prompt", run: () => router.push("/learn/brain/last-prompt") });
  if (/api|endpoint|תיעוד/.test(q)) add({ id: "nav-api-index", label: "📚 API Index", hint: "/learn/api-index", run: () => router.push("/learn/api-index") });
  if (/undo|בטל|חזור|לבטל/.test(q)) add({
    id: "undo-last",
    label: "⏪ בטל את הפעולה האחרונה",
    hint: "POST /api/v1/learn/undo-last",
    run: async () => {
      try {
        const res = await fetch("/api/v1/learn/undo-last", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ dryRun: false }) });
        const j = await res.json();
        if (j.undone) alert(`✓ בוטל: ${j.actionType} · ${j.detail}`);
        else alert(`⚠ לא בוטל: ${j.reason ?? "unknown"}`);
      } catch (e) { alert(`שגיאה: ${(e as Error).message}`); }
    },
  });
  if (/upgrade|שדרוג/.test(q)) add({ id: "nav-upgrades", label: "⬆️ שדרוגי מוח", hint: "/learn/brain/upgrades", run: () => router.push("/learn/brain/upgrades") });
  if (/project|פרויקט/.test(q) || q === "") add({ id: "nav-projects", label: "📁 פרויקטים", hint: "/projects", run: () => router.push("/projects") });
  if (/source|מקור|spring/.test(q)) add({ id: "nav-sources", label: "📥 מקורות", hint: "/learn/sources", run: () => router.push("/learn/sources") });
  if (/guide|מדריך/.test(q)) add({ id: "nav-guides", label: "📘 מדריכים", hint: "/learn/guides", run: () => router.push("/learn/guides") });
  if (/consistency|עקביות|אי-עקב/.test(q)) add({ id: "nav-inconsistencies", label: "🔍 בדיקת אי-עקביות", hint: "/learn/inconsistencies", run: () => router.push("/learn/inconsistencies") });
  if (/calibration|קליב/.test(q)) add({ id: "api-calibration", label: "🎯 ECE קליברציה (API)", hint: "GET /api/v1/learn/insights/calibration", run: () => { window.open("/api/v1/learn/insights/calibration", "_blank"); } });

  // === Season-scoped ===
  if (currentSeasonId) {
    if (/opening|פתיח/.test(q)) add({ id: "season-opening", label: "🎬 פתיחת העונה הנוכחית", run: () => router.push(`/seasons/${currentSeasonId}#opening`) });
  }

  // === Creation shortcuts (defer to brain chat for actual execution) ===
  if (/new (episode|scene)|פרק חדש|סצנה חדשה/.test(q)) {
    add({
      id: "brain-create",
      label: `🧠 פתח צ'אט עם הבמאי — "${raw}"`,
      hint: "ישלח את הטקסט לבמאי שיחזיר action",
      run: () => {
        sessionStorage.setItem("vexo-command-palette-prefill", raw);
        router.push("/learn/brain/chat");
      },
    });
  }

  // === Fallback ===
  if (q.length > 0 && out.length === 0) {
    add({
      id: "brain-ask",
      label: `🧠 שאל את הבמאי: "${raw}"`,
      hint: "פותח צ'אט עם הטקסט שהקלדת",
      run: () => {
        sessionStorage.setItem("vexo-command-palette-prefill", raw);
        router.push("/learn/brain/chat");
      },
    });
  }

  return out.slice(0, 10);
}
