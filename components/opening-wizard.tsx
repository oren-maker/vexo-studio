"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const MODEL_INFO = {
  seedance:    { emoji: "⚡", name: "SeeDance 2",          maxDuration: 12, pricePerSec: 0.124, audio: false, maxSubjects: 1 },
  kling:       { emoji: "🎬", name: "Kling 2.1",          maxDuration: 10, pricePerSec: 0.056, audio: false, maxSubjects: 1 },
  "veo3-fast": { emoji: "🟪", name: "VEO 3 Fast (fal)",   maxDuration: 8,  pricePerSec: 0.40,  audio: true,  maxSubjects: 1 },
  "veo3-pro":  { emoji: "💎", name: "VEO 3 Pro (fal)",    maxDuration: 8,  pricePerSec: 0.75,  audio: true,  maxSubjects: 1 },
  "google-veo-3.1-fast-generate-preview": { emoji: "✨", name: "VEO 3.1 Fast (Google ישיר)",  maxDuration: 8, pricePerSec: 0.35, audio: true, maxSubjects: 3 },
  "google-veo-3.1-generate-preview":      { emoji: "💫", name: "VEO 3.1 Pro (Google ישיר)",   maxDuration: 8, pricePerSec: 0.50, audio: true, maxSubjects: 3 },
  "google-veo-3.1-lite-generate-preview": { emoji: "🌟", name: "VEO 3.1 Lite (Google ישיר)",  maxDuration: 8, pricePerSec: 0.20, audio: true, maxSubjects: 3 },
  "sora-2":     { emoji: "🎭", name: "Sora 2 (OpenAI ישיר)",      maxDuration: 20, pricePerSec: 0.10, audio: true, maxSubjects: 1 },
  "sora-2-pro": { emoji: "🏆", name: "Sora 2 Pro (OpenAI ישיר)",  maxDuration: 20, pricePerSec: 0.30, audio: true, maxSubjects: 1 },
  "vidu-q1":    { emoji: "🧩", name: "Vidu Q1 (fal)",            maxDuration: 8,  pricePerSec: 0.08, audio: true, maxSubjects: 7 },
} as const;
type ModelKey = keyof typeof MODEL_INFO;

type Character = { id: string; name: string; roleType?: string | null; media: { fileUrl: string }[] };
type Style = { key: string; name: string; vibe: string; samplePrompt: string; isDefault?: boolean };

export function OpeningWizard({
  seasonId, characters, he, onCancel, onFinished,
}: {
  seasonId: string;
  characters: Character[];
  he: boolean;
  onCancel: () => void;
  onFinished: (openingId: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [styles, setStyles] = useState<Style[] | null>(null);
  const [stylesErr, setStylesErr] = useState<string | null>(null);
  const [stylesBusy, setStylesBusy] = useState(true);
  const [pickedStyle, setPickedStyle] = useState<Style | null>(null);
  const [customStyle, setCustomStyle] = useState("");

  const [includeChars, setIncludeChars] = useState(true);
  const [charIds, setCharIds] = useState<string[]>(() => characters.slice(0, 4).map((c) => c.id));

  const [model, setModel] = useState<ModelKey>("sora-2");
  const [duration, setDuration] = useState(20);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");

  const [prompt, setPrompt] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Fetch style suggestions on mount
  useEffect(() => {
    (async () => {
      setStylesBusy(true); setStylesErr(null);
      try {
        const r = await api<{ styles: Style[] }>(`/api/v1/seasons/${seasonId}/opening/suggest-styles`, { method: "POST", body: {} });
        setStyles(r.styles);
        // Auto-pick the default style (character-showcase) so the user can advance without clicking
        const def = r.styles.find((s) => s.isDefault) ?? r.styles[0];
        if (def) setPickedStyle(def);
      } catch (e) { setStylesErr((e as Error).message); }
      finally { setStylesBusy(false); }
    })();
  }, [seasonId]);

  // Snap duration to new model's max when model changes
  useEffect(() => {
    const max = MODEL_INFO[model].maxDuration;
    if (duration > max) setDuration(max);
  }, [model, duration]);

  const rate = MODEL_INFO[model].pricePerSec;
  const estUsd = rate * duration;

  async function buildPrompt() {
    const styleKey = pickedStyle?.key ?? "custom";
    const styleLabel = pickedStyle?.name ?? customStyle.slice(0, 80);
    if (styleKey === "custom" && !customStyle.trim()) { setBuildErr(he ? "כתוב סגנון מותאם אישית" : "Describe your custom style"); return; }
    setBuildBusy(true); setBuildErr(null);
    try {
      const r = await api<{ openingId: string; prompt: string }>(`/api/v1/seasons/${seasonId}/opening/build-prompt`, {
        method: "POST",
        body: {
          style: styleKey, styleLabel,
          includeCharacters: includeChars,
          characterIds: includeChars ? charIds : [],
          duration, aspectRatio: aspect, model,
          customPromptSeed: styleKey === "custom" ? customStyle : undefined,
        },
      });
      setOpeningId(r.openingId); setPrompt(r.prompt); setStep(4);
    } catch (e) { setBuildErr((e as Error).message); }
    finally { setBuildBusy(false); }
  }

  async function saveEditedPrompt() {
    if (!openingId) return;
    setBuildBusy(true); setBuildErr(null);
    try {
      await api(`/api/v1/seasons/${seasonId}/opening`, { method: "PATCH", body: { prompt } });
    } catch (e) { setBuildErr((e as Error).message); }
    finally { setBuildBusy(false); }
  }

  async function saveAndClose() {
    if (!openingId) return;
    setSaveBusy(true); setSaveErr(null);
    try {
      // Persist any final edits to the prompt + settings
      await api(`/api/v1/seasons/${seasonId}/opening`, {
        method: "PATCH",
        body: { prompt, duration, aspectRatio: aspect, model, includeCharacters: includeChars, characterIds: includeChars ? charIds : [] },
      });
      onFinished(openingId);
    } catch (e) { setSaveErr((e as Error).message); }
    finally { setSaveBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card rounded-card max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-bg-main flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">🎬 {he ? "יצירת פתיחה עם AI" : "Create opening with AI"}</h3>
            <div className="text-xs text-text-muted mt-1">{he ? `שלב ${step} מתוך 5` : `Step ${step} of 5`}</div>
          </div>
          <button onClick={onCancel} className="text-text-muted text-lg">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {step === 1 && (
            <div>
              <div className="text-sm font-semibold mb-3">{he ? "בחר סגנון לפתיחה" : "Pick a style"}</div>
              {stylesBusy && <div className="text-sm text-text-muted">{he ? "🤖 ה-AI סוקר את הסדרה ומציע 4 סגנונות…" : "🤖 AI is reading the series and proposing 4 styles…"}</div>}
              {stylesErr && <div className="bg-status-errBg text-status-errText rounded-lg p-3 text-sm">{stylesErr}</div>}
              {styles && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {styles.map((s) => (
                    <button key={s.key} onClick={() => setPickedStyle(s)} className={`text-start rounded-lg border-2 p-3 transition-colors ${pickedStyle?.key === s.key ? "border-accent bg-accent/5" : "border-bg-main hover:border-accent/50"}`}>
                      <div className="flex items-center gap-2">
                        <div className="font-bold flex-1">{s.name}</div>
                        {s.isDefault && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-white font-semibold">⭐ {he ? "ברירת מחדל" : "default"}</span>}
                      </div>
                      <div className="text-xs text-text-muted mt-1">{s.vibe}</div>
                      <details className="mt-2"><summary className="text-[11px] text-accent cursor-pointer">{he ? "דוגמת פרומט" : "Sample prompt"}</summary><div className="text-[11px] mt-1 text-text-secondary">{s.samplePrompt}</div></details>
                    </button>
                  ))}
                  <button onClick={() => setPickedStyle({ key: "custom", name: he ? "מותאם אישית" : "Custom", vibe: "", samplePrompt: "" })} className={`text-start rounded-lg border-2 p-3 transition-colors ${pickedStyle?.key === "custom" ? "border-accent bg-accent/5" : "border-bg-main hover:border-accent/50"}`}>
                    <div className="font-bold">🎨 {he ? "מותאם אישית" : "Custom"}</div>
                    <div className="text-xs text-text-muted mt-1">{he ? "תתאר את הסגנון בעצמך" : "Describe your own style"}</div>
                  </button>
                </div>
              )}
              {pickedStyle?.key === "custom" && (
                <textarea value={customStyle} onChange={(e) => setCustomStyle(e.target.value)} rows={3} placeholder={he ? "לדוגמה: מונטאז' שחור-לבן עם גרפיקה קינטית של כותרות..." : "e.g. black-and-white montage with kinetic title graphics..."} className="mt-3 w-full px-3 py-2 rounded-lg border border-bg-main text-sm" />
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="text-sm font-semibold mb-3">{he ? "לכלול דמויות?" : "Include characters?"}</div>
              <div className="flex gap-2 mb-4">
                <button onClick={() => setIncludeChars(true)} className={`px-4 py-2 rounded-lg border-2 text-sm ${includeChars ? "border-accent bg-accent/5 font-semibold" : "border-bg-main"}`}>{he ? "כן — עם שמות על המסך" : "Yes — with on-screen names"}</button>
                <button onClick={() => setIncludeChars(false)} className={`px-4 py-2 rounded-lg border-2 text-sm ${!includeChars ? "border-accent bg-accent/5 font-semibold" : "border-bg-main"}`}>{he ? "לא — פתיחה מופשטת" : "No — abstract intro"}</button>
              </div>
              {includeChars && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {characters.map((c) => {
                    const on = charIds.includes(c.id);
                    return (
                      <button key={c.id} onClick={() => setCharIds((xs) => on ? xs.filter((x) => x !== c.id) : [...xs, c.id])} className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 ${on ? "border-accent bg-accent/5" : "border-bg-main"}`}>
                        {c.media[0] ? <img src={c.media[0].fileUrl} alt="" className="w-16 h-16 rounded-full object-cover" /> : <div className="w-16 h-16 rounded-full bg-bg-main flex items-center justify-center text-2xl">🎭</div>}
                        <div className="text-xs font-semibold truncate w-full text-center">{c.name}</div>
                        {c.roleType && <div className="text-[10px] text-text-muted">{c.roleType}</div>}
                      </button>
                    );
                  })}
                  {characters.length === 0 && <div className="col-span-4 text-center py-4 text-text-muted text-sm">{he ? "אין דמויות בסדרה — תוסיף בלשונית דמויות" : "No characters yet"}</div>}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="text-sm font-semibold mb-3">{he ? "מודל, משך ויחס" : "Model, duration, aspect"}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                {(Object.keys(MODEL_INFO) as ModelKey[]).map((k) => {
                  const m = MODEL_INFO[k];
                  return (
                    <button key={k} onClick={() => setModel(k)} className={`text-start rounded-lg border-2 p-3 ${model === k ? "border-accent bg-accent/5" : "border-bg-main hover:border-accent/50"}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl">{m.emoji}</span>
                        <span className="font-semibold">{m.name}</span>
                        <span className={`text-[10px] rounded-full px-2 py-0.5 ${m.audio ? "bg-status-okBg text-status-okText" : "bg-bg-main text-text-muted"}`}>{m.audio ? "🔊 " + (he ? "סאונד" : "audio") : "🔇 " + (he ? "שקט" : "silent")}</span>
                        {m.maxSubjects > 1 && <span className="text-[10px] rounded-full px-2 py-0.5 bg-accent/15 text-accent font-semibold">👥 {he ? `עד ${m.maxSubjects} דמויות` : `${m.maxSubjects} subjects`}</span>}
                      </div>
                      <div className="text-xs text-text-muted mt-1">{he ? `עד ${m.maxDuration}s · $${m.pricePerSec}/sec` : `up to ${m.maxDuration}s · $${m.pricePerSec}/sec`}</div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mb-1">
                <label className="text-xs text-text-muted w-20">{he ? "משך" : "Duration"}</label>
                <input type="range" min={4} max={MODEL_INFO[model].maxDuration} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="flex-1" />
                <span className="num font-semibold w-12 text-end">{duration}s</span>
              </div>
              {MODEL_INFO[model].maxDuration <= 8 && (
                <div className="text-[11px] text-status-warnText mb-3 ms-20">
                  ℹ {he ? `${MODEL_INFO[model].name} מוגבל ל-8 שניות — לפתיחה ארוכה יותר (עד 12s) בחר SeeDance 2` : `${MODEL_INFO[model].name} caps at 8s — for a longer intro (up to 12s) pick SeeDance 2`}
                </div>
              )}
              <div className="text-[11px] text-text-muted mb-3 ms-20">
                📌 {he ? "שם הסדרה יופיע אוטומטית בתחילת או בסוף הפתיחה ככרטיסיית כותרת" : "Series title will appear as a title card at the start or end"}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted w-20">{he ? "יחס" : "Aspect"}</span>
                {(["16:9", "9:16", "1:1"] as const).map((a) => (
                  <button key={a} onClick={() => setAspect(a)} className={`px-3 py-1 rounded-lg border text-sm ${aspect === a ? "border-accent bg-accent text-white font-semibold" : "border-bg-main"}`}>{a}</button>
                ))}
              </div>
              <div className="mt-4 bg-bg-main rounded-lg p-3 text-sm flex justify-between">
                <span className="text-text-muted">{he ? "עלות משוערת" : "Est. cost"}</span>
                <span className="num font-bold">${estUsd.toFixed(2)}</span>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-semibold">{he ? "פרומט (ניתן לעריכה)" : "Prompt (editable)"}</div>
                {buildBusy && <span className="text-xs text-text-muted">{he ? "שומר…" : "Saving…"}</span>}
              </div>
              {buildErr && <div className="bg-status-errBg text-status-errText rounded-lg p-2 text-xs mb-2">{buildErr}</div>}
              {!prompt && !buildBusy ? (
                <button onClick={buildPrompt} className="w-full py-3 rounded-lg bg-accent text-white font-semibold">🤖 {he ? "ייצר פרומט עם AI" : "Generate prompt with AI"}</button>
              ) : buildBusy && !prompt ? (
                <div className="text-center py-8 text-text-muted text-sm">{he ? "🤖 ה-AI בונה פרומט משולב עם הדמויות והסגנון…" : "🤖 AI is building the prompt…"}</div>
              ) : (
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={saveEditedPrompt} rows={10} className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm font-mono" />
              )}
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="text-sm font-semibold mb-3">{he ? "סיכום ושמירה" : "Review & save"}</div>
              <div className="bg-bg-main rounded-lg p-3 text-xs space-y-1 mb-4">
                <div><span className="text-text-muted">{he ? "סגנון:" : "Style:"}</span> <span className="font-semibold">{pickedStyle?.name ?? "—"}</span></div>
                <div><span className="text-text-muted">{he ? "דמויות:" : "Cast:"}</span> {includeChars ? charIds.length : (he ? "אין" : "none")}</div>
                <div><span className="text-text-muted">{he ? "מודל:" : "Model:"}</span> {MODEL_INFO[model].emoji} {MODEL_INFO[model].name}</div>
                <div><span className="text-text-muted">{he ? "משך × יחס:" : "Duration × aspect:"}</span> {duration}s · {aspect}</div>
                <div><span className="text-text-muted">{he ? "עלות משוערת לייצור:" : "Est. generation cost:"}</span> <span className="num font-bold">${estUsd.toFixed(2)}</span></div>
              </div>
              <div className="bg-accent/10 rounded-lg p-3 text-xs text-accent mb-4">
                ℹ {he ? "ההגדרות יישמרו. הסרטון עצמו לא ייווצר עכשיו — לחץ על 'צור וידאו' בכרטיס הפתיחה אחרי שתסגור את האשף." : "Settings will be saved. The video itself won't be rendered — click 'Generate video' on the opening card after closing the wizard."}
              </div>
              <button disabled={saveBusy} onClick={saveAndClose} className="w-full py-3 rounded-lg bg-accent text-white font-semibold disabled:opacity-50">
                {saveBusy ? (he ? "שומר…" : "Saving…") : `💾 ${he ? "שמור וצא" : "Save & close"}`}
              </button>
              {saveErr && <div className="bg-status-errBg text-status-errText rounded-lg p-3 text-sm mt-3">{saveErr}</div>}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-bg-main flex justify-between items-center">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm">{he ? "ביטול" : "Cancel"}</button>
          <div className="flex gap-2">
            {step > 1 && <button onClick={() => setStep((s) => (s - 1) as 1|2|3|4|5)} disabled={saveBusy} className="px-3 py-1.5 rounded-lg border border-bg-main text-sm disabled:opacity-50">{he ? "חזור" : "Back"}</button>}
            {step < 3 && <button onClick={() => setStep((s) => (s + 1) as 1|2|3|4|5)} disabled={step === 1 && !pickedStyle} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">{he ? "הבא" : "Next"}</button>}
            {step === 3 && <button onClick={() => { buildPrompt(); setStep(4); }} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">{he ? "בנה פרומט →" : "Build prompt →"}</button>}
            {step === 4 && prompt && <button onClick={() => setStep(5)} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">{he ? "הבא →" : "Next →"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
