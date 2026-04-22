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
  const [stylesElapsed, setStylesElapsed] = useState(0);
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
  const [buildElapsed, setBuildElapsed] = useState(0);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  type SceneCtx = { number: number; summary: string; excerpt: string; bridge: string | null };
  const [sceneCtx, setSceneCtx] = useState<{ scenes: SceneCtx[]; connection: string | null } | null>(null);

  // Fetch style suggestions on mount
  const [stylesAttempt, setStylesAttempt] = useState(0);
  useEffect(() => {
    (async () => {
      setStylesBusy(true); setStylesErr(null); setStylesElapsed(0);
      try {
        const r = await api<{ styles: Style[] }>(`/api/v1/seasons/${seasonId}/opening/suggest-styles`, { method: "POST", body: {}, timeoutMs: 90_000 });
        setStyles(r.styles);
        // Auto-pick the default style (character-showcase) so the user can advance without clicking
        const def = r.styles.find((s) => s.isDefault) ?? r.styles[0];
        if (def) setPickedStyle(def);
      } catch (e) { setStylesErr((e as Error).message || "שגיאה בטעינת הסגנונות"); }
      finally { setStylesBusy(false); }
    })();
  }, [seasonId, stylesAttempt]);

  // Per-second elapsed counter while loading styles so the user sees something is happening
  useEffect(() => {
    if (!stylesBusy) return;
    const t = setInterval(() => setStylesElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [stylesBusy]);

  // Snap duration to new model's max when model changes
  useEffect(() => {
    const max = MODEL_INFO[model].maxDuration;
    if (duration > max) setDuration(max);
  }, [model, duration]);

  // Pull the first 3 scenes + their bridge for inline plot context
  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ scenes: SceneCtx[]; connection: string | null }>(`/api/v1/seasons/${seasonId}/opening/context`);
        setSceneCtx(r);
      } catch { /* non-blocking */ }
    })();
  }, [seasonId]);

  // Tick a per-second elapsed counter while building so the user sees progress.
  useEffect(() => {
    if (!buildBusy) { setBuildElapsed(0); return; }
    const t = setInterval(() => setBuildElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [buildBusy]);

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
        signal: AbortSignal.timeout(75_000),
      });
      setOpeningId(r.openingId); setPrompt(r.prompt); setStep(4);
    } catch (e) {
      const err = e as Error;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        setBuildErr(he ? "ה-AI לא הגיב תוך 75 שניות. לחץ '🔁 נסה שוב'." : "AI didn't respond within 75s. Click 'Retry'.");
      } else {
        setBuildErr(err.message);
      }
    }
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

  // --- "Let the director improve" flow (step 4) --------------------------
  const [improveBusy, setImproveBusy] = useState(false);
  const [improveErr, setImproveErr] = useState<string | null>(null);
  const [improveElapsed, setImproveElapsed] = useState(0);
  const [proposal, setProposal] = useState<{ improvedPrompt: string; changes: string[]; summary: string } | null>(null);
  useEffect(() => {
    if (!improveBusy) return;
    const t = setInterval(() => setImproveElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [improveBusy]);

  async function askBrainToImprove() {
    if (!prompt.trim()) return;
    setImproveBusy(true); setImproveErr(null); setImproveElapsed(0); setProposal(null);
    try {
      const r = await api<{ improvedPrompt: string; changes: string[]; summary: string }>(
        `/api/v1/seasons/${seasonId}/opening/brain-improve`,
        {
          method: "POST",
          body: { prompt, styleLabel: pickedStyle?.name, model, duration },
          timeoutMs: 90_000,
        },
      );
      setProposal({ improvedPrompt: r.improvedPrompt, changes: r.changes ?? [], summary: r.summary ?? "" });
    } catch (e) { setImproveErr((e as Error).message || (he ? "שגיאה" : "Error")); }
    finally { setImproveBusy(false); }
  }

  async function acceptProposal() {
    if (!proposal) return;
    setPrompt(proposal.improvedPrompt);
    setProposal(null);
    // persist the new prompt so a refresh doesn't lose it
    if (openingId) {
      try { await api(`/api/v1/seasons/${seasonId}/opening`, { method: "PATCH", body: { prompt: proposal.improvedPrompt } }); } catch {}
    }
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

  // --- "Create video now" flow (step 5) --------------------------------
  // Saves the settings AND kicks off the Sora/VEO generation before closing
  // the wizard. User lands on the season page with a job already in flight.
  const [generateBusy, setGenerateBusy] = useState(false);
  async function saveAndGenerate() {
    if (!openingId) return;
    setSaveBusy(true); setGenerateBusy(true); setSaveErr(null);
    try {
      await api(`/api/v1/seasons/${seasonId}/opening`, {
        method: "PATCH",
        body: { prompt, duration, aspectRatio: aspect, model, includeCharacters: includeChars, characterIds: includeChars ? charIds : [] },
      });
      await api(`/api/v1/seasons/${seasonId}/opening/generate`, { method: "POST", body: {}, timeoutMs: 60_000 });
      onFinished(openingId);
    } catch (e) {
      setSaveErr((e as Error).message || (he ? "שגיאה בהפעלת הייצור" : "Failed to start generation"));
    }
    finally { setSaveBusy(false); setGenerateBusy(false); }
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
              {stylesBusy && (
                <div className="text-sm text-text-muted flex items-center gap-2">
                  <span>{he ? "🤖 ה-AI סוקר את הסדרה ומציע 4 סגנונות…" : "🤖 AI is reading the series and proposing 4 styles…"}</span>
                  <span className="font-mono text-xs opacity-60">({stylesElapsed}s)</span>
                  {stylesElapsed > 30 && (
                    <span className="text-[11px] text-status-warnText">{he ? "לוקח יותר מהצפוי — Gemini/Groq במאמץ" : "Slower than usual — Gemini/Groq under load"}</span>
                  )}
                </div>
              )}
              {stylesErr && (
                <div className="bg-status-errBg text-status-errText rounded-lg p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
                  <span>⚠ {stylesErr}</span>
                  <button
                    onClick={() => setStylesAttempt((n) => n + 1)}
                    className="px-3 py-1 rounded bg-status-errText text-white text-xs font-semibold hover:opacity-90"
                  >
                    {he ? "נסה שוב" : "Retry"}
                  </button>
                </div>
              )}
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
              <div className="text-sm font-semibold mb-3">{he ? "משך ויחס" : "Duration & aspect"}</div>
              {/* Model is locked to Sora 2 — one model, one look, zero decisions. */}
              <div className="rounded-lg border-2 border-accent bg-accent/5 p-3 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl">🎭</span>
                  <span className="font-semibold">Sora 2 (OpenAI)</span>
                  <span className="text-[10px] rounded-full px-2 py-0.5 bg-status-okBg text-status-okText">🔊 {he ? "סאונד מסונכרן" : "synced audio"}</span>
                  <span className="text-[10px] rounded-full px-2 py-0.5 bg-accent/15 text-accent font-semibold">⭐ {he ? "ברירת מחדל" : "default"}</span>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {he ? "עד 20s · $0.10/sec · תומך ב-4/8/12/16/20 שניות" : "Up to 20s · $0.10/sec · 4/8/12/16/20 buckets"}
                </div>
              </div>
              <div className="flex items-center gap-3 mb-1">
                <label className="text-xs text-text-muted w-20">{he ? "משך" : "Duration"}</label>
                {/* Hard cap at 20s per Oren's request. Chain-extend of
                 *  longer openings was producing unreliable identity/continuity
                 *  and compounding moderation blocks — 20s is the max a single
                 *  Sora job accepts natively. */}
                <div className="flex-1 grid grid-cols-5 gap-1">
                  {[4, 8, 12, 16, 20].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setDuration(sec)}
                      className={`py-1.5 rounded-lg border-2 text-xs font-semibold ${duration === sec ? "border-accent bg-accent text-white" : "border-bg-main text-text-muted hover:border-accent/50"}`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-text-muted mb-3 ms-20">
                📌 {he ? "תקרה של 20 שניות לפתיחה — מעבר לזה Sora מפצל לחלקים ומאבד המשכיות. שם הסדרה יופיע אוטומטית ככרטיסיית כותרת." : "Opening capped at 20s — beyond that Sora chains clips and loses continuity. Series title appears as a title card automatically."}
              </div>

              {/* Moderation safety guide — shown whenever the wizard opens,
                  with stronger emphasis if the previous job failed. */}
              <div className="mb-3 ms-20 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px]">
                <div className="font-semibold text-amber-700 mb-1">⚠️ {he ? "הגבלות מודרציה של Sora / VEO — קרא לפני שמירה" : "Sora / VEO moderation guardrails — read before save"}</div>
                <ul className="list-disc ps-4 space-y-0.5 text-text-muted">
                  <li>{he ? "מילים אסורות: soldier, military, combat, war, weapon, gun, knife, violence, blood, kill, death, murder, crime, drugs, tattoo, paranoid, thriller, surveillance, noir." : "Forbidden: soldier, military, combat, war, weapon, gun, knife, violence, blood, kill, death, murder, crime, drugs, tattoo, paranoid, thriller, surveillance, noir."}</li>
                  <li>{he ? "טון אסור: psychological thriller, simulation reveal, dark basement, shock-reveal, cold determination, identity crisis, dread." : "Forbidden tone: psychological thriller, simulation reveal, dark basement, shock-reveal, cold determination, identity crisis, dread."}</li>
                  <li>{he ? "מומלץ: curiosity, wonder, gentle realization, luminous hall, gallery, quiet study, artist/teacher/dancer/writer/scholar." : "Recommended: curiosity, wonder, gentle realization, luminous hall, gallery, quiet study, artist/teacher/dancer/writer/scholar."}</li>
                  <li>{he ? "אם נחסם — שכתב את הטון, לא רק מילים (lesson from SC9 × 3 blocks today)." : "If blocked — rewrite the tone, not just keywords (lesson from SC9 × 3 blocks today)."}</li>
                </ul>
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
              {sceneCtx && sceneCtx.scenes.length > 0 && (
                <div className="mb-3 bg-bg-main rounded-lg p-3 text-xs space-y-2 border border-bg-main">
                  <div className="font-semibold text-text-muted">{he ? "📖 הקשר עלילתי (3 סצנות פתיחה)" : "📖 Plot context (first 3 scenes)"}</div>
                  {sceneCtx.scenes.map((s) => (
                    <div key={s.number} className="leading-relaxed">
                      <span className="font-bold">SC{s.number}:</span> {s.summary || s.excerpt}
                    </div>
                  ))}
                  {sceneCtx.connection && (
                    <div className="pt-2 border-t border-bg-card text-accent">
                      <span className="font-bold">{he ? "החיבור: " : "Connection: "}</span>{sceneCtx.connection}
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-semibold">{he ? "פרומט (ניתן לעריכה)" : "Prompt (editable)"}</div>
                {buildBusy && <span className="text-xs text-text-muted">{he ? `🤖 בונה… ${buildElapsed}s` : `🤖 Building… ${buildElapsed}s`}</span>}
              </div>
              {buildErr && (
                <div className="bg-status-errBg text-status-errText rounded-lg p-2 text-xs mb-2 flex items-center justify-between gap-2">
                  <span>{buildErr}</span>
                  <button onClick={buildPrompt} className="px-2 py-1 rounded bg-accent text-white text-xs whitespace-nowrap">🔁 {he ? "נסה שוב" : "Retry"}</button>
                </div>
              )}
              {!prompt && !buildBusy ? (
                <button onClick={buildPrompt} className="w-full py-3 rounded-lg bg-accent text-white font-semibold">🤖 {he ? "ייצר פרומט עם AI" : "Generate prompt with AI"}</button>
              ) : buildBusy && !prompt ? (
                <div className="text-center py-8 text-text-muted text-sm space-y-2">
                  <div>{he ? `🤖 ה-AI בונה פרומט משולב עם הדמויות והסגנון… (${buildElapsed}s)` : `🤖 AI is building the prompt… (${buildElapsed}s)`}</div>
                  {buildElapsed > 30 && <div className="text-xs">{he ? "לוקח קצת זמן — Gemini עמוס. עוד עד 75s ואז יהיה כפתור 'נסה שוב'." : "Taking a bit — Gemini busy. Up to 75s before retry."}</div>}
                </div>
              ) : (
                <>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={saveEditedPrompt} rows={10} className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm font-mono" />
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={askBrainToImprove}
                      disabled={improveBusy}
                      className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold disabled:opacity-60"
                      title={he ? "הבמאי יקרא את הפרומט ויציע שיפור על בסיס הידע שלו" : "The director reads the prompt and proposes an improvement"}
                    >
                      {improveBusy
                        ? (he ? `🎬 הבמאי חושב… (${improveElapsed}s)` : `🎬 Director thinking… (${improveElapsed}s)`)
                        : (he ? "🎬 תן לבמאי לשפר" : "🎬 Let the director improve")}
                    </button>
                    {improveErr && <span className="text-[11px] text-status-errText">⚠ {improveErr}</span>}
                  </div>

                  {proposal && (
                    <div className="mt-3 bg-purple-500/10 border border-purple-500/40 rounded-lg p-3 text-xs space-y-3">
                      <div>
                        <div className="font-bold text-purple-300 mb-1">{he ? "🎬 ההצעה של הבמאי" : "🎬 Director's proposal"}</div>
                        {proposal.summary && <div className="text-text-muted mb-2">{proposal.summary}</div>}
                      </div>
                      {proposal.changes.length > 0 && (
                        <div>
                          <div className="font-semibold mb-1">{he ? "מה שונה:" : "What changed:"}</div>
                          <ul className="list-disc ms-5 space-y-0.5 text-text-secondary">
                            {proposal.changes.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      <div>
                        <div className="font-semibold mb-1">{he ? "פרומט חדש:" : "New prompt:"}</div>
                        <div className="bg-bg-main rounded p-2 font-mono leading-relaxed max-h-48 overflow-y-auto">{proposal.improvedPrompt}</div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={acceptProposal} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold">
                          ✓ {he ? "קבל את ההצעה" : "Accept proposal"}
                        </button>
                        <button onClick={() => setProposal(null)} className="px-3 py-1.5 rounded-lg border border-bg-main text-xs font-semibold">
                          ✕ {he ? "דחה והשאר ככה" : "Reject and keep"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
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
                ℹ {he ? "שתי אפשרויות: 'צור וידאו' יתחיל את הייצור מיד (Sora/VEO — ~2-5 דק'). 'שמור וצא' רק ישמור הגדרות." : "Two options: 'Create video' starts generation now (Sora/VEO ~2-5 min). 'Save & close' only saves settings."}
              </div>
              <button
                disabled={saveBusy || generateBusy}
                onClick={saveAndGenerate}
                className="w-full py-3 rounded-lg bg-accent text-white font-bold disabled:opacity-50 text-base"
              >
                {generateBusy ? (he ? "🎬 שולח ל-Sora…" : "🎬 Sending to Sora…") : `🎬 ${he ? `צור וידאו (${duration}s · $${estUsd.toFixed(2)})` : `Create video (${duration}s · $${estUsd.toFixed(2)})`}`}
              </button>
              <button
                disabled={saveBusy || generateBusy}
                onClick={saveAndClose}
                className="w-full py-2 mt-2 rounded-lg border border-bg-main text-sm font-semibold disabled:opacity-50"
              >
                {saveBusy && !generateBusy ? (he ? "שומר…" : "Saving…") : `💾 ${he ? "רק שמור וצא (בלי לייצר)" : "Just save & close (no generation)"}`}
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
