"use client";
import { useEffect, useState } from "react";

// Keyboard cheat sheet — press "?" anywhere to see every shortcut +
// brain action category the system exposes. Groups help Oren remember
// what's available as the surface area grows.
// Lives as a separate global so the ⌘K palette stays focused on *doing*
// while "?" stays focused on *learning*.

type Section = { title: string; rows: { key: string; desc: string }[] };

const SECTIONS: Section[] = [
  {
    title: "קיצורי מקלדת",
    rows: [
      { key: "⌘K  /  Ctrl+K", desc: "פותח את ה-Command Palette" },
      { key: "/", desc: "פותח את הצ'אט של הבמאי ומכניס פוקוס" },
      { key: "?", desc: "פותח את דף הקיצורים הזה" },
      { key: "Esc", desc: "סוגר palette/צ'אט/מודאל" },
      { key: "↑", desc: "בתיבת הצ'אט הריקה — טוען את ההודעה האחרונה" },
      { key: "Enter", desc: "שליחה · Shift+Enter שורה חדשה" },
      { key: "j / k", desc: "בעמוד סצנה — הסצנה הבאה/קודמת באותו פרק" },
    ],
  },
  {
    title: "פעולות יצירה (compose/generate)",
    rows: [
      { key: "compose_prompt", desc: "פרומפט קולנועי מלא, 400-900 מילים" },
      { key: "generate_video", desc: "Sora 2 / VEO / Vidu / Seedance וכו'" },
      { key: "estimate_cost", desc: "dry-run לפני כל generation יקרה" },
      { key: "generate_character_portrait", desc: "nano-banana/imagen 4 ל-CharacterMedia" },
      { key: "generate_episode_thumbnail", desc: "nano-banana key-art לפרק" },
      { key: "generate_series_summary", desc: "סיכום 3-פסקאות לסדרה" },
      { key: "generate_shot_list", desc: "מפרק scriptText ל-shot list JSON" },
    ],
  },
  {
    title: "פעולות הפקה (scene/episode/season)",
    rows: [
      { key: "create_scene / update_scene", desc: "CRUD של סצנות" },
      { key: "create_episode / update_episode", desc: "CRUD של פרקים" },
      { key: "create_season", desc: "עונה חדשה בסדרה" },
      { key: "delete_scene", desc: "DRAFT בלבד — אחרת סירוב" },
      { key: "archive_episode", desc: "ARCHIVED, הפיך" },
      { key: "update_opening_prompt", desc: "פרומפט פתיחה של עונה" },
    ],
  },
  {
    title: "פעולות ייבוא + מדריכים",
    rows: [
      { key: "import_guide_url / ai_guide", desc: "מדריכים — מ-URL או מנושא" },
      { key: "import_instagram_guide", desc: "Reel → מדריך" },
      { key: "import_source", desc: "IG/TikTok → LearnSource" },
      { key: "update_reference", desc: "עדכון BrainReference עם גרסה" },
    ],
  },
  {
    title: "שליפה + ניווט",
    rows: [
      { key: "search_memory", desc: "שליפה סמנטית מפורשת מהספרייה" },
      { key: "extract_last_frame", desc: "bridgeFrameUrl לסצנה (i2v seed)" },
      { key: "ask_question", desc: "הבמאי שואל הבהרה עם options" },
    ],
  },
  {
    title: "היסטוריה ואינטגריטי",
    rows: [
      { key: "revert_version", desc: "גולל scene/opening/reference לגרסה קודמת" },
      { key: "queue_music_track / queue_dubbing_track", desc: "רושם בקשה, לא מחולל אודיו" },
    ],
  },
  {
    title: "עמודי תצפית",
    rows: [
      { key: "/learn/brain", desc: "בית הבמאי — זהות, maturity" },
      { key: "/learn/insights · /learn/consciousness", desc: "תובנות, תודעה" },
      { key: "/learn/costs", desc: "לוח עלויות" },
      { key: "/learn/failed-jobs", desc: "רטריי לעבודות שנכשלו" },
      { key: "/learn/inconsistencies", desc: "drift של דמויות + שמות חסרים" },
      { key: "/learn/brain/upgrades", desc: "שיפורים אוטומטיים מה-Rejection cron" },
      { key: "/api/v1/learn/insights/calibration", desc: "ECE (אחרי איסוף נתונים)" },
      { key: "/learn/costs", desc: "לוח עלויות" },
      { key: "/learn/failed-jobs", desc: "רטריי לעבודות שנכשלו" },
      { key: "/learn/activity", desc: "heatmap פעילות" },
      { key: "/learn/brain/last-prompt", desc: "System Prompt Inspector" },
      { key: "/learn/presets", desc: "תבניות פרומפט" },
      { key: "/learn/search/all", desc: "חיפוש גלובלי" },
      { key: "/learn/api-index", desc: "מפת API" },
    ],
  },
];

export function CheatSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (!inField && e.key === "?") { e.preventDefault(); setOpen((o) => !o); return; }
      if (open && e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[101] bg-black/60 flex items-center justify-center p-6" onClick={() => setOpen(false)} dir="rtl">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">📖 קיצורים ויכולות</h2>
            <div className="text-xs text-slate-400 mt-0.5">לחץ "?" בכל מקום לפתיחה · Esc לסגירה</div>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200 text-2xl">×</button>
        </div>

        <div className="p-6 grid md:grid-cols-2 gap-6">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="text-sm font-semibold text-cyan-300 mb-2">{s.title}</h3>
              <ul className="space-y-1.5">
                {s.rows.map((r, i) => (
                  <li key={i} className="text-xs flex gap-2">
                    <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded font-mono text-[11px] whitespace-nowrap">{r.key}</code>
                    <span className="text-slate-300">{r.desc}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
