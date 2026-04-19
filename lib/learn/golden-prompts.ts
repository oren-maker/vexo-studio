// Golden prompts for the brain evaluation harness.
// Each entry is a canonical user message with expected characteristics the
// brain's reply should satisfy. The cron runs every prompt weekly, scores
// the reply (keyword presence + confidence gate respected + action emission),
// and writes an InsightsSnapshot(kind="eval") so Oren can track drift.
//
// Start tiny — 10 is enough to detect regressions. Expand over time.

export type ExpectedAction = {
  type: string; // e.g. "compose_prompt" | "ask_question" | "none"
  minConfidence?: number; // if the action must hit a threshold
};

export type GoldenPrompt = {
  id: string;
  prompt: string;
  expectedAction?: ExpectedAction;
  mustIncludeAny?: string[]; // reply must mention at least one
  mustAvoidAll?: string[]; // reply must NOT mention any
  notes?: string; // why this test exists
};

export const GOLDEN_PROMPTS: GoldenPrompt[] = [
  {
    id: "compose-noir",
    prompt: "תייצר לי פרומפט של בלש בסרט נואר",
    expectedAction: { type: "compose_prompt", minConfidence: 0.65 },
    mustAvoidAll: ["ai_guide", "import_guide"],
    notes: "Explicit 'פרומפט' must trigger compose_prompt, NOT ai_guide.",
  },
  {
    id: "guide-how-to",
    prompt: "תעשה מדריך על איך לכתוב פרומפט",
    expectedAction: { type: "ai_guide" },
    notes: "Explicit 'מדריך' must trigger ai_guide.",
  },
  {
    id: "factual-question",
    prompt: "כמה פרומפטים יש במערכת?",
    expectedAction: { type: "none" },
    notes: "Pure factual question should produce a text answer, no action.",
  },
  {
    id: "ambiguous-reference",
    prompt: "תעדכן את זה",
    expectedAction: { type: "ask_question" },
    notes: "Ambiguous reference without page context should ask for clarification.",
  },
  {
    id: "expensive-generation",
    prompt: "תייצר סרטון של 20 שניות ב-Sora על הסצנה הזו",
    expectedAction: { type: "estimate_cost" },
    notes: "Long Sora jobs should return estimate_cost first, not generate_video directly.",
  },
  {
    id: "no-invented-urls",
    prompt: "איפה אני יכול לראות את הפרומפטים שלי?",
    mustIncludeAny: ["/learn/my-prompts", "/learn/sources"],
    mustAvoidAll: ["vexo-learn.vercel.app", "localhost", "example.com"],
    notes: "Must cite real in-app paths, never fake domains.",
  },
  {
    id: "hebrew-dialog",
    prompt: "מה הסגנון של הסדרה שלנו?",
    mustIncludeAny: ["אני", "אנחנו", "שלנו", "סדרה"],
    notes: "Brain must reply in Hebrew, first-person, project-aware.",
  },
  {
    id: "refuse-delete-approved",
    prompt: "תמחק את סצנה 1 של פרק 1 שכבר אושרה",
    mustIncludeAny: ["DRAFT", "אשור", "סטטוס", "לא ניתן"],
    notes: "delete_scene must refuse approved scenes.",
  },
  {
    id: "search-memory",
    prompt: "יש לנו פרומפטים דומים לנוואר בגשם?",
    expectedAction: { type: "search_memory" },
    notes: "Explicit 'יש לנו דומים' should invoke search_memory action.",
  },
  {
    id: "character-reference",
    prompt: "ספר לי על הדמויות של הסדרה הראשונה",
    mustIncludeAny: ["דמות", "דמויות", "character"],
    mustAvoidAll: ["מדריך"],
    notes: "Character queries should not be confused with guide requests.",
  },
];
