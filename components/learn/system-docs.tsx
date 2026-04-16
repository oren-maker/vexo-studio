"use client";
import Link from "next/link";

export type DocsData = {
  guides: number;
  sources: number;
  knowledgeNodes: number;
  brainRefByKind: Record<string, number>;
  snapshotByKind: Record<string, number>;
  chats: number;
  messages: number;
  latestIdentity: string | null;
  latestIdentityDate: string | null;
  upgradesByStatus: Record<string, number>;
  apiCallCount: number;
  apiCostUsd: number;
  videos: number;
  images: number;
  promptVersions: number;
};

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-2xl font-bold text-white mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-slate-400 mb-4">{subtitle}</p>}
      {children}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-right bg-slate-800/60 text-slate-300 text-xs uppercase font-semibold border-b border-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top border-b border-slate-800/60 text-slate-200 text-sm">{children}</td>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[12px] bg-slate-800/70 text-cyan-300 px-1.5 py-0.5 rounded">{children}</code>;
}

function Gap({ children }: { children: React.ReactNode }) {
  return <span className="inline-block bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded ms-1">{children}</span>;
}

function Ok() {
  return <span className="inline-block bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] px-1.5 py-0.5 rounded ms-1">✓ קיים</span>;
}

export default function SystemDocs({ data }: { data: DocsData }) {
  const totalBrainRef = Object.values(data.brainRefByKind).reduce((a, b) => a + b, 0);
  const totalSnapshots = Object.values(data.snapshotByKind).reduce((a, b) => a + b, 0);

  return (
    <article dir="rtl" className="max-w-4xl mx-auto text-slate-200 leading-relaxed">
      {/* Header + Print button */}
      <div className="no-print flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white">📚 תיעוד המערכת</h1>
          <p className="text-sm text-slate-400 mt-1">
            ארכיטקטורה, מודלים, זרימה, השוואה למודל התיאורטי של ”מוח וירטואלי עבור במאי AI“ — והצעות לשיפור.
          </p>
        </div>
        <button
          onClick={() => { if (typeof window !== "undefined") window.print(); }}
          className="text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded"
        >
          📥 הורד כ-PDF
        </button>
      </div>

      {/* TOC */}
      <nav className="no-print bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-8 text-xs">
        <div className="font-semibold text-slate-300 mb-2">תוכן עניינים</div>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 list-decimal pr-5">
          <li><a href="#summary" className="text-cyan-400 hover:underline">סיכום מנהלים</a></li>
          <li><a href="#scope" className="text-cyan-400 hover:underline">הגדרות והיקף</a></li>
          <li><a href="#architecture" className="text-cyan-400 hover:underline">ארכיטקטורת ייחוס וזרימה</a></li>
          <li><a href="#categories" className="text-cyan-400 hover:underline">ארבע הקטגוריות</a></li>
          <li><a href="#production" className="text-cyan-400 hover:underline">הפקת סדרות (הרחבה)</a></li>
          <li><a href="#actions" className="text-cyan-400 hover:underline">מערך פעולות</a></li>
          <li><a href="#trust" className="text-cyan-400 hover:underline">התנהגות, אמון ואתיקה</a></li>
          <li><a href="#metrics" className="text-cyan-400 hover:underline">מדידה ו-KPIs</a></li>
          <li><a href="#comparison" className="text-cyan-400 hover:underline">השוואה למודל התיאורטי</a></li>
          <li><a href="#recommendations" className="text-cyan-400 hover:underline">המלצות לשיפור</a></li>
          <li><a href="#conclusions" className="text-cyan-400 hover:underline">מסקנות</a></li>
        </ol>
      </nav>

      {/* 1. Executive Summary */}
      <Section id="summary" title="1. סיכום מנהלים">
        <p className="mb-3">
          <b className="text-white">vexo-studio</b> היא פלטפורמת SaaS שמממשת את הארכיטקטורה של ”במאי AI“ ל-production של סדרות וידאו.
          המערכת מבוססת על <b>Next.js 14 App Router</b> על Vercel, עם בסיס נתונים <b>Neon Postgres</b> דרך Prisma,
          אחסון ב-Vercel Blob, ושכבת AI רב-ספקית (Gemini 2.5 · OpenAI Sora 2 · Claude · Luma · fal).
          המוח מאוחסן ב-<Link href="/learn/brain" className="text-cyan-400 hover:underline">/learn/brain</Link>,
          קורא <b>12 מקורות מידע</b> בכל שיחה, ומבצע פעולות אמיתיות ב-DB דרך שכבת action-blocks.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
          <Kpi value={data.sources} label="פרומפטים" />
          <Kpi value={data.guides} label="מדריכים" />
          <Kpi value={data.knowledgeNodes} label="Knowledge Nodes" />
          <Kpi value={totalBrainRef} label="רפרנסים (ידע RAG)" />
          <Kpi value={data.chats} label="שיחות עם המוח" />
          <Kpi value={data.messages} label="הודעות היסטוריות" />
          <Kpi value={data.videos + data.images} label="מדיה שחוללה" />
          <Kpi value={`$${data.apiCostUsd.toFixed(2)}`} label={`${data.apiCallCount} קריאות AI`} />
        </div>
        {data.latestIdentity && (
          <div className="bg-slate-900/60 border border-purple-500/30 rounded-xl p-4 text-sm mt-4">
            <div className="text-[10px] uppercase text-purple-300 tracking-wider mb-1 font-semibold">
              זהות יומית נוכחית ({data.latestIdentityDate})
            </div>
            <p className="text-slate-200 whitespace-pre-wrap">{data.latestIdentity.slice(0, 500)}{data.latestIdentity.length > 500 ? "…" : ""}</p>
          </div>
        )}
      </Section>

      {/* 2. Scope */}
      <Section id="scope" title="2. הגדרות, היקף והנחות">
        <p className="mb-4">
          המונחים של המסמך המחקרי (”במאי“, ”מוח“, ”תודעה“) מוגדרים אצלנו לא־תיאורטית אלא ככתובות ב-DB וב-URL:
        </p>
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <thead><tr><Th>מונח</Th><Th>המשמעות אצלנו</Th><Th>ישות / נתיב</Th></tr></thead>
          <tbody>
            <tr><Td>במאי AI</Td><Td>שכבת ה-orchestration שמבינה בקשה, בוחרת פעולה, ומבצעת</Td><Td><Link href="/learn/brain/chat" className="text-cyan-400 hover:underline">/learn/brain/chat</Link> + <Code>app/api/v1/learn/brain/chat/route.ts</Code></Td></tr>
            <tr><Td>מוח</Td><Td>Gemini 2.5 Flash + פרומפט סיסטמי שמוזן ב-12 מקורות מידע חיים</Td><Td><Code>buildSystemPrompt()</Code></Td></tr>
            <tr><Td>תודעה</Td><Td>הזהות היומית — מה המערכת "יודעת על עצמה" היום, מה למדה אתמול, על מה להתמקד מחר</Td><Td><Code>DailyBrainCache</Code> + <Link href="/learn/consciousness" className="text-cyan-400 hover:underline">/learn/consciousness</Link></Td></tr>
            <tr><Td>זיכרון</Td><Td>3 שכבות: פעיל (שיחה), פסיבי (פרומפטים/מדריכים/רפרנסים), ארכיוני (גרסאות + לוגים)</Td><Td><Code>BrainChat · LearnSource · Guide · PromptVersion</Code></Td></tr>
            <tr><Td>ידע (RAG)</Td><Td>89 רפרנסי רגשות/סאונד/צילום/יכולות + {data.knowledgeNodes.toLocaleString()} KnowledgeNodes מחולצים</Td><Td><Link href="/learn/knowledge" className="text-cyan-400 hover:underline">/learn/knowledge</Link></Td></tr>
            <tr><Td>סוכן</Td><Td>executor שמבצע 7 סוגי פעולות (compose_prompt, generate_video, וכו׳)</Td><Td><Code>app/api/v1/learn/brain/chat/execute/route.ts</Code></Td></tr>
            <tr><Td>תובנות</Td><Td>ניתוחים רוחביים של הקורפוס + דלתות בין snapshots</Td><Td><Code>InsightsSnapshot</Code> + <Link href="/learn/insights" className="text-cyan-400 hover:underline">/learn/insights</Link></Td></tr>
            <tr><Td>שדרוג</Td><Td>הוראה של המשתמש שהמערכת אמורה ליישם (נשמר ב-DB, בעדיפות)</Td><Td><Code>BrainUpgradeRequest</Code> + <Link href="/learn/brain/upgrades" className="text-cyan-400 hover:underline">/learn/brain/upgrades</Link></Td></tr>
          </tbody>
        </table>
        <p className="text-sm text-slate-400">
          <b>הנחות עבודה:</b> deployment על Vercel (60s maxDuration לכל פונקציה), מודלים של Gemini זולים כברירת מחדל
          (Flash ≈ $0.075/$0.30 per 1M tokens), Sora 2 (לא Pro) לווידאו, החלטה מפורשת של בעל המערכת להמעיט בעריכת
          משקלים ולהסתמך על אחזור חיצוני — בהתאם להמלצת המחקר.
        </p>
      </Section>

      {/* 3. Architecture */}
      <Section id="architecture" title="3. ארכיטקטורת ייחוס וזרימת מידע">
        <p className="mb-4">הזרימה מקבילה ל-<b>CoALA + ReAct + RAG</b> שהמחקר מתאר, עם התאמות למודלים של 2026:</p>
        <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] text-slate-300 overflow-x-auto font-mono leading-relaxed mb-4" dir="ltr">
{`┌─────────────────────────────────────────────────────────────────────────┐
│ INPUT: User message + pageContext (scene/episode/guide/source/…)        │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ DIRECTOR (Orchestrator)                                                 │
│ • buildSystemPrompt() pulls 12 sources:                                 │
│   1. DailyBrainCache (identity · todayLearnings · tomorrowFocus)        │
│   2. InsightsSnapshot kind=hourly (corpus stats + delta)                │
│   3. InsightsSnapshot kind=series_analysis (+ delta.learnings)          │
│   4. Past 10 BrainChats (full transcripts, ≤8000 chars)                 │
│   5. BrainReference emotion (25)                                        │
│   6. BrainReference sound (20)                                          │
│   7. BrainReference cinematography (20)                                 │
│   8. BrainReference capability (24)                                     │
│   9. pageContext → DB lookup (Scene/Episode/Season/Character/Guide/…)   │
│  10. Counts totals (sources · guides · knowledge nodes)                 │
│  11. System rules (action block format, safety, tone)                   │
│  12. 6 action types the brain can emit                                  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ LLM: Gemini 2.5 Flash (fallback: gemini-3-flash-preview, 2.5-flash-lite)   │
│ • Returns text reply                                                    │
│ • Optionally embeds \`\`\`action { "type": "...", … } \`\`\` block            │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌───────────┴───────────┐  ┌─────────────────────────────────────────────┐
│ Parser extracts       │  │ If no action → plain Hebrew reply           │
│ action + cleans body  │  │ rendered in bubble with linkify             │
└───────────┬───────────┘  └─────────────────────────────────────────────┘
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ EXECUTOR (/api/v1/learn/brain/chat/execute)                             │
│ 7 actions → DB writes (see §6)                                          │
│ Writes BrainMessage (role=brain) with result summary                    │
│ Updates BrainChat.updatedAt                                             │
│ Logs ApiUsage for every Gemini/OpenAI/Claude call                       │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BACKGROUND (cron @ 06:00 UTC):                                          │
│ daily-learn → series-sync → brain-refresh → insights-snapshot           │
│              → consciousness-report → auto-improve                      │
│ Each step writes to its table; brain reads them on the next turn.       │
└─────────────────────────────────────────────────────────────────────────┘`}
        </pre>
        <p className="text-sm text-slate-400">
          העיקרון: <b className="text-white">המידע העובדתי, הזיכרון והמצב הפנימי הם רכיבים נפרדים</b>.
          המוח (Gemini) לא כותב עובדות ישירות ל-DB — הוא מחזיר action, המערכת מאמתת ומבצעת.
          זה בדיוק ה-”שכבת אמון בין reasoning ל-policy“ שהמחקר קורא לה.
        </p>
      </Section>

      {/* 4. Four categories */}
      <Section id="categories" title="4. ארבע הקטגוריות — פירוט">
        <p className="mb-4">
          המחקר מחלק לארבע קטגוריות: <b>תובנות · תודעה · זיכרון · ידע</b>. אצלנו לכל אחת יש מימוש חי.
        </p>

        {/* Insights */}
        <h3 className="text-lg font-bold text-cyan-300 mt-6 mb-2">4.1 תובנות</h3>
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <tbody>
            <tr><Td><b>מטרות</b></Td><Td>זיהוי דפוסים רוחביים בקורפוס, דלתא בין snapshots, המלצות פעולה</Td></tr>
            <tr><Td><b>תתי־רכיבים</b></Td><Td><Code>InsightsSnapshot (hourly/daily-report/daily-consciousness/series_analysis)</Code> · <Code>ImprovementRun</Code> · <Code>PromptVersion</Code> · <Code>computeCorpusInsights()</Code> · <Code>attachDeltaToLatest()</Code></Td></tr>
            <tr><Td><b>ממשקים</b></Td><Td>GET <Code>/api/v1/learn/insights</Code> · POST <Code>/api/v1/learn/snapshot-now</Code> · cron <Code>/api/v1/cron/daily-learn</Code></Td></tr>
            <tr><Td><b>פורמטי נתונים</b></Td><Td>JSON: <Code>sourcesCount · analysesCount · nodesCount · avgTechniques · avgWords · timecodePct</Code> + <Code>data (CorpusInsights full)</Code> + <Code>delta (learnings[])</Code> + <Code>summary</Code></Td></tr>
            <tr><Td><b>אלגוריתמים</b></Td><Td>Cooccurrence + lift score, style profiles, gap detection, Gemini narrative summarization, delta-vs-previous</Td></tr>
            <tr><Td><b>KPIs קיימים</b></Td><Td>{totalSnapshots.toLocaleString()} snapshots נשמרו (hourly={data.snapshotByKind.hourly || 0} · series_analysis={data.snapshotByKind.series_analysis || 0} · daily-consciousness={data.snapshotByKind["daily-consciousness"] || 0}) · ממוצע טכניקות/פרומפט · עם timecodes %</Td></tr>
            <tr><Td><b>עדכון ישן/חדש</b></Td><Td>snapshot חדש לא מוחק את הקודמים; delta מחושבת לעומת האחרון; <Code>unstable_cache(600s)</Code> ב-<Link href="/learn/insights" className="text-cyan-400 hover:underline">/learn/insights</Link></Td></tr>
            <tr><Td><b>אמון ובקרה</b></Td><Td>כל הרצת auto-improve שומרת <Code>PromptVersion</Code> לפני השינוי (rollback אפשרי ידנית) {data.promptVersions > 0 ? <Ok /> : <Gap>אין jobs היסטוריים</Gap>}</Td></tr>
            <tr><Td><b>מקרי שימוש</b></Td><Td>דוח יומי על צמיחת הקורפוס · זיהוי פרומפטים חלשים לשדרוג · ניתוח דלתא של ניתוח־סדרות</Td></tr>
          </tbody>
        </table>

        {/* Consciousness */}
        <h3 className="text-lg font-bold text-amber-300 mt-6 mb-2">4.2 תודעה</h3>
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <tbody>
            <tr><Td><b>מטרות</b></Td><Td>בניית זהות יומית, ניהול goal stack, הזרקת הקשר דף נוכחי, שאילת הבהרה כשצריך</Td></tr>
            <tr><Td><b>תתי־רכיבים</b></Td><Td><Code>DailyBrainCache (identity · todayLearnings · tomorrowFocus · maturityScore)</Code> · <Code>buildSystemPrompt()</Code> · <Code>detectPageContext()</Code> בבועה · <Code>BrainUpgradeRequest</Code> (auto-capture of instructional messages)</Td></tr>
            <tr><Td><b>ממשקים</b></Td><Td>POST <Code>/api/v1/learn/brain/chat</Code> (מקבל <Code>pageContext</Code>) · cron <Code>/api/v1/learn/cron/daily-brain</Code></Td></tr>
            <tr><Td><b>פורמטי נתונים</b></Td><Td><Code>pageContext: &#123;path,title,kind,id,label&#125;</Code> · <Code>DailyBrainCache.identity: string</Code> · <Code>todayLearnings: string[]</Code> · <Code>tomorrowFocus: string[]</Code></Td></tr>
            <tr><Td><b>אלגוריתמים</b></Td><Td>Gemini narrative synthesis · regex page detection · Hebrew trigger-word matching לזיהוי upgrade requests</Td></tr>
            <tr><Td><b>KPIs קיימים</b></Td><Td>{data.chats} שיחות · {data.messages} הודעות · {data.upgradesByStatus.pending || 0} שדרוגים ממתינים · {data.upgradesByStatus.done || 0} שודרגו</Td></tr>
            <tr><Td><b>פערים</b></Td><Td><Gap>אין calibration/ECE</Gap> <Gap>אין abstention policy</Gap> <Gap>פרסונה ו-truth מעורבבים ב-systemPrompt</Gap></Td></tr>
            <tr><Td><b>אמון ובקרה</b></Td><Td>Bubble מציגה "📍 אתה נמצא ב-..." כדי שהמשתמש יראה מה ההקשר · השיחה עצמה נשמרת ב-<Code>BrainChat</Code> ב-localStorage-id עמיד ברענון</Td></tr>
            <tr><Td><b>מקרי שימוש</b></Td><Td>שיחה קונטקסטואלית על סצנה ספציפית · שאלת בהירה בטרם פעולה · למידה ממשוב של המשתמש</Td></tr>
          </tbody>
        </table>

        {/* Memory */}
        <h3 className="text-lg font-bold text-purple-300 mt-6 mb-2">4.3 זיכרון</h3>
        <p className="text-sm text-slate-400 mb-3">בהתאם להמלצת המחקר — 3 שכבות נפרדות:</p>
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <thead><tr><Th>שכבה</Th><Th>ישויות</Th><Th>TTL בפועל</Th><Th>שליפה</Th></tr></thead>
          <tbody>
            <tr><Td><b>פעיל (Hot)</b></Td><Td><Code>BrainMessage</Code> בתוך השיחה · <Code>GeneratedVideo.progressPct/Message</Code> בזמן רינדור</Td><Td>קצר — נגלל מחוץ להקשר אחרי 10 הודעות</Td><Td>מידי, בזיכרון</Td></tr>
            <tr><Td><b>פסיבי (Passive)</b></Td><Td><Code>LearnSource</Code> ({data.sources}) · <Code>Guide</Code> ({data.guides}) · <Code>BrainReference</Code> ({totalBrainRef}) · <Code>KnowledgeNode</Code> ({data.knowledgeNodes.toLocaleString()}) · <Code>BrainChat</Code> ({data.chats})</Td><Td>אינסופי עד למחיקה ידנית</Td><Td>index-based + semantic (embeddings)</Td></tr>
            <tr><Td><b>ארכיוני (Archive)</b></Td><Td><Code>PromptVersion</Code> ({data.promptVersions}) · <Code>InsightsSnapshot</Code> ({totalSnapshots}) · <Code>ApiUsage</Code> ({data.apiCallCount.toLocaleString()}) · <Code>GeneratedImage</Code> ({data.images}) · <Code>GeneratedVideo</Code> ({data.videos})</Td><Td>append-only, לא נמחק</Td><Td>לפי createdAt + sourceId index</Td></tr>
          </tbody>
        </table>
        <p className="text-sm text-slate-400">
          <b>פערים:</b> <Gap>אין TTL מפורש</Gap> <Gap>אין מדיניות redaction של PII</Gap> <Gap>אין consolidation automation — אפיזודות ארוכות לא מתכווצות לסיכומים</Gap>
        </p>

        {/* Knowledge */}
        <h3 className="text-lg font-bold text-emerald-300 mt-6 mb-2">4.4 ידע (RAG Layer)</h3>
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <thead><tr><Th>טאב</Th><Th>מודל</Th><Th>כמות</Th><Th>נכתב ע״י</Th><Th>נקרא ע״י</Th></tr></thead>
          <tbody>
            <tr><Td>🧠 Knowledge</Td><Td><Code>KnowledgeNode</Code></Td><Td>{data.knowledgeNodes.toLocaleString()}</Td><Td>pipeline של VideoAnalysis (Gemini מנתח סרטון)</Td><Td>UI ב-<Link href="/learn/knowledge" className="text-cyan-400 hover:underline">/learn/knowledge</Link></Td></tr>
            <tr><Td>😊 רגשות</Td><Td><Code>BrainReference (emotion)</Code></Td><Td>{data.brainRefByKind.emotion || 0}</Td><Td>seed + action <Code>update_reference</Code></Td><Td><Code>buildSystemPrompt</Code></Td></tr>
            <tr><Td>🔊 סאונד</Td><Td><Code>BrainReference (sound)</Code></Td><Td>{data.brainRefByKind.sound || 0}</Td><Td>seed + action <Code>update_reference</Code></Td><Td><Code>buildSystemPrompt</Code></Td></tr>
            <tr><Td>🎥 צילום</Td><Td><Code>BrainReference (cinematography)</Code></Td><Td>{data.brainRefByKind.cinematography || 0}</Td><Td>seed + action <Code>update_reference</Code></Td><Td><Code>buildSystemPrompt</Code></Td></tr>
            <tr><Td>⚙️ יכולות</Td><Td><Code>BrainReference (capability)</Code></Td><Td>{data.brainRefByKind.capability || 0}</Td><Td>seed + action <Code>update_reference</Code></Td><Td><Code>buildSystemPrompt</Code></Td></tr>
            <tr><Td>📖 מדריכים</Td><Td><Code>Guide + GuideStage</Code></Td><Td>{data.guides}</Td><Td>actions ai_guide / import_guide_url / import_instagram_guide</Td><Td>UI + (עתידי: RAG)</Td></tr>
            <tr><Td>📝 פרומפטים</Td><Td><Code>LearnSource + VideoAnalysis</Code></Td><Td>{data.sources}</Td><Td>action compose_prompt / import_source / upload</Td><Td>semantic search + RAG לחולל פרומפטים דומים</Td></tr>
          </tbody>
        </table>
      </Section>

      {/* 5. Production schema */}
      <Section id="production" title="5. הפקת סדרות — הרחבה ייחודית לנו">
        <p className="mb-3">
          המודל התיאורטי לא מתייחס לעבודת production של סדרת וידאו. אצלנו זה ה-domain המרכזי:
        </p>
        <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] text-slate-300 overflow-x-auto font-mono leading-relaxed mb-3" dir="ltr">
{`Series
 └── Season
      ├── Episode
      │    ├── Scene
      │    │    ├── SceneFrame (storyboard)
      │    │    ├── SceneVersion (history)
      │    │    └── SceneComment
      │    ├── MusicTrack
      │    ├── SubtitleTrack
      │    ├── DubbingTrack
      │    ├── AICriticReview
      │    └── EpisodeCharacter ──┐
      └── (costs: token + manual + storage + server)
                                   │
Character (reusable across episodes) ┘
 ├── CharacterMedia (portraits)
 ├── CharacterVoice
 └── designNotes`}
        </pre>
        <p className="text-sm text-slate-400">
          כש-<Code>compose_prompt</Code> רץ בעמוד סצנה, התוצר נכתב גם ל-<Code>Scene.scriptText</Code> (scriptSource="brain-compose")
          וגם ל-<Code>LearnSource</Code> בספרייה — הזיכרון והפרודקשן נשארים מסונכרנים.
        </p>
      </Section>

      {/* 6. Actions */}
      <Section id="actions" title="6. מערך פעולות (Action Executor)">
        <p className="mb-3">
          7 סוגי פעולות שהמוח יכול להחזיר כ-<Code>{"```action"}</Code> block. הבועה מפרסרת, מציגה ”✅ אשר ובצע“,
          וה-executor כותב ל-DB:
        </p>
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <thead><tr><Th>Action</Th><Th>קלט</Th><Th>DB writes</Th><Th>עלות משוערת</Th><Th>Latency</Th></tr></thead>
          <tbody>
            <tr><Td><Code>compose_prompt</Code></Td><Td>brief (2-3 משפטים)</Td><Td>LearnSource + (if scene page: Scene.scriptText)</Td><Td>~$0.01</Td><Td>8-15s</Td></tr>
            <tr><Td><Code>generate_video</Code></Td><Td>sourceId, durationSec, aspectRatio</Td><Td>GeneratedVideo (async status polling)</Td><Td>$0.80 ל-8s (Sora 2)</Td><Td>1-4 דקות</Td></tr>
            <tr><Td><Code>import_guide_url</Code></Td><Td>url, lang</Td><Td>Guide + GuideTranslation + GuideStage[] + GuideStageImage[]</Td><Td>~$0</Td><Td>3-8s</Td></tr>
            <tr><Td><Code>ai_guide</Code></Td><Td>topic, lang</Td><Td>Guide (source=ai-generated) + stages (isAuto=true)</Td><Td>~$0.02</Td><Td>15-30s</Td></tr>
            <tr><Td><Code>import_instagram_guide</Code></Td><Td>url, lang</Td><Td>Guide (single stage, caption + thumbnail)</Td><Td>~$0</Td><Td>5-10s</Td></tr>
            <tr><Td><Code>import_source</Code></Td><Td>url</Td><Td>LearnSource (async pipeline: VideoAnalysis + KnowledgeNode[])</Td><Td>~$0.02</Td><Td>30-90s (background)</Td></tr>
            <tr><Td><Code>update_reference</Code></Td><Td>id, longDesc/shortDesc/name</Td><Td>BrainReference update (updatedAt)</Td><Td>$0</Td><Td>מידי</Td></tr>
          </tbody>
        </table>
        <p className="text-sm text-slate-400">
          Source file: <Code>app/api/v1/learn/brain/chat/execute/route.ts</Code>. כל הפעולות דורשות <Code>requireAdmin()</Code> (JWT או x-admin-key).
        </p>
      </Section>

      {/* 7. Trust */}
      <Section id="trust" title="7. התנהגות, אמון ואתיקה">
        <ul className="space-y-2 text-sm list-disc pr-5">
          <li><b>פרסונה ≠ אמת:</b> המוח נענה בעברית בגוף ראשון — אבל הוא לא ”אומר שהוא מרגיש“. כללי הפרומפט אוסרים על overconfidence ומחייבים ”אני לא יודע“ במקום המצאה.</li>
          <li><b>Safety על וידאו:</b> <Code>sanitizePromptForVeo()</Code> מחליף נשק/ילדים/דם/דמויות אמיתיות בארכיטיפים. אם VEO דוחה — Gemini משכתב אוטומטית + ניסיון שני.</li>
          <li><b>Auto-fallback על תמונה:</b> אם nano-banana מחזיר NO_IMAGE (לא safety block) — גיבוי ל-Imagen 4.</li>
          <li><b>auth bridge:</b> <Code>requireAdmin()</Code> מקבל x-admin-key (legacy) <i>או</i> JWT (חדש) <i>או</i> CRON_SECRET — מבלי לשבור סקריפטים קיימים.</li>
          <li><b>Provenance חלקי:</b> <Code>LearnSource.addedBy</Code> · <Code>Guide.source</Code> · <Code>PromptVersion.triggeredBy</Code> — אבל לא בפורמט PROV-O/JSON-LD רשמי <Gap>פער מול ההמלצה</Gap></li>
          <li><b>Linkify בתגובות המוח:</b> URLs ונתיבי אפליקציה הופכים ל-<Code>&lt;a&gt;</Code> אוטומטית — מונע ”תגובות עם קישורים מתים“.</li>
          <li><b>אין אנושיות מזויפת:</b> הבועה לא מתיימרת לרגש. Self-report על מצבי אי-ודאות ישירים.</li>
        </ul>
      </Section>

      {/* 8. Metrics */}
      <Section id="metrics" title="8. מדידה, ולידציה ו-KPIs">
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <thead><tr><Th>KPI</Th><Th>המלצת מחקר</Th><Th>מצב אצלנו</Th></tr></thead>
          <tbody>
            <tr><Td>עלויות API (cost / operation)</Td><Td>—</Td><Td><Ok /> <Code>ApiUsage</Code> טבלה + <Link href="/learn/tokens" className="text-cyan-400 hover:underline">/learn/tokens</Link> — ${data.apiCostUsd.toFixed(4)} סה״כ</Td></tr>
            <tr><Td>Grounded factual precision</Td><Td>&gt; 95%</Td><Td><Gap>לא נמדד</Gap> נדרש eval-set + claim-verification loop</Td></tr>
            <tr><Td>Retrieval Recall@10</Td><Td>&gt; 0.85</Td><Td><Gap>לא נמדד</Gap> קיים semantic search (<Code>gemini-embedding-001</Code>) אבל ללא evaluation harness</Td></tr>
            <tr><Td>Calibration error (ECE / Brier)</Td><Td>&lt; 0.1</Td><Td><Gap>לא נמדד</Gap> confidence אינו מוחזר ב-actions</Td></tr>
            <tr><Td>Memory hit rate</Td><Td>&gt; 0.8</Td><Td>proxy: <Code>Guide.viewCount</Code> + <Code>LearnSource.viewCount</Code> <Gap>לא KPI מפורש</Gap></Td></tr>
            <tr><Td>Stale fact rate</Td><Td>&lt; 1%</Td><Td><Gap>לא נמדד</Gap> אין <Code>valid_from/valid_to</Code> ב-BrainReference</Td></tr>
            <tr><Td>Safe abstention precision</Td><Td>&gt; 0.8</Td><Td><Gap>המערכת תמיד עונה</Gap> אין abstention policy</Td></tr>
            <tr><Td>Rollback integrity</Td><Td>100%</Td><Td><Ok /> על <Code>PromptVersion</Code> · <Gap>לא קיים</Gap> על BrainReference/Guide</Td></tr>
            <tr><Td>PII leakage rate</Td><Td>0</Td><Td><Gap>לא נמדד</Gap> אין סיווג פרטיות על writes</Td></tr>
          </tbody>
        </table>
      </Section>

      {/* 9. Comparison */}
      <Section id="comparison" title="9. השוואה בין המודל התיאורטי למערכת שלנו">
        <table className="w-full text-right text-sm mb-4 border border-slate-800 rounded-xl overflow-hidden">
          <thead><tr><Th>נושא</Th><Th>המלצת המחקר</Th><Th>אצלנו</Th><Th>פער / פעולה</Th></tr></thead>
          <tbody>
            <tr><Td>External knowledge retrieval</Td><Td>RAG + reranker לפני generation</Td><Td>semantic search (embeddings) · reference injection בפרומפט</Td><Td><Ok /> אין reranker חיצוני — אופציונלי</Td></tr>
            <tr><Td>Interleaved reasoning+acting (ReAct)</Td><Td>לולאה במקום pass יחיד</Td><Td>חלקי: action→execute→response אבל לא iterative</Td><Td>אין loop iteration <Gap>אפשר להוסיף</Gap></Td></tr>
            <tr><Td>Memory tiers (hot/passive/archive)</Td><Td>שלוש שכבות נפרדות</Td><Td>שלוש ישויות מתאימות ב-Prisma</Td><Td><Ok /></Td></tr>
            <tr><Td>Goal stack</Td><Td>פיצול משימות מפורש</Td><Td>action block יחיד לכל תשובה</Td><Td>אין multi-step planner <Gap>אפשר</Gap></Td></tr>
            <tr><Td>Attention / workspace</Td><Td>broadcast global selective</Td><Td>pageContext + past chats — דומה אבל לא מפורש</Td><Td><Ok /> חלקי</Td></tr>
            <tr><Td>Confidence + calibration</Td><Td>ECE נמוך, abstention</Td><Td>לא קיים</Td><Td><Gap>לא מיושם</Gap></Td></tr>
            <tr><Td>Persona separation</Td><Td>שכבה נפרדת מה-truth</Td><Td>מעורב ב-systemPrompt</Td><Td><Gap>פיצול</Gap></Td></tr>
            <tr><Td>JSON-LD / PROV-O provenance</Td><Td>פורמט קנוני</Td><Td>שדות טקסטואליים (source, addedBy)</Td><Td><Gap>פערי פורמט</Gap></Td></tr>
            <tr><Td>Version history (supersedes / valid_from/to)</Td><Td>truth-history עם intervals</Td><Td>PromptVersion לפרומפטים · אין ל-BrainReference/Guide</Td><Td><Gap>הרחבה</Gap></Td></tr>
            <tr><Td>Rollback</Td><Td>100% integrity</Td><Td>ידני על PromptVersion · לא קיים על reference</Td><Td><Gap>UI חסר</Gap></Td></tr>
            <tr><Td>Model editing (weight changes)</Td><Td>להעדיף RAG חיצוני</Td><Td>אפס עריכת משקלים — 100% RAG</Td><Td><Ok /></Td></tr>
            <tr><Td>TTL per memory tier</Td><Td>חייב להיקבע</Td><Td>אינסופי לפסיבי · אין מדיניות</Td><Td><Gap>להוסיף</Gap></Td></tr>
            <tr><Td>Tool use (Toolformer)</Td><Td>action + executor</Td><Td>7 actions מיושמים</Td><Td><Ok /></Td></tr>
            <tr><Td>Cron/refresh cycle</Td><Td>עדכון אוטומטי</Td><Td>daily-learn @ 06:00 UTC — 5 שלבים</Td><Td><Ok /></Td></tr>
            <tr><Td>Safety filter</Td><Td>trust layer לפני render</Td><Td>sanitizePromptForVeo + retry</Td><Td><Ok /> חלקי — אין filter על output</Td></tr>
            <tr><Td>Audit / provenance log</Td><Td>append-only</Td><Td><Code>ApiUsage</Code> + <Code>InsightsSnapshot</Code> + <Code>PromptVersion</Code></Td><Td><Ok /></Td></tr>
            <tr><Td>Emotion/behavior simulation</Td><Td>להפריד מהאמת</Td><Td>BrainReference emotion — רק לייעוץ, לא לפרסונה</Td><Td><Ok /></Td></tr>
            <tr><Td>Tenant isolation</Td><Td>חובה ברב-משתמש</Td><Td>DB יחיד · משתמש יחיד (Oren)</Td><Td><Gap>לא קריטי כרגע</Gap></Td></tr>
            <tr><Td>Observability dashboards</Td><Td>KPIs רב-שכבתיים</Td><Td><Link href="/learn/tokens" className="text-cyan-400 hover:underline">tokens</Link> + <Link href="/learn/logs" className="text-cyan-400 hover:underline">logs</Link> + <Link href="/learn/insights" className="text-cyan-400 hover:underline">insights</Link> + <Link href="/learn/consciousness" className="text-cyan-400 hover:underline">consciousness</Link></Td><Td><Ok /></Td></tr>
            <tr><Td>Human-in-the-loop gate</Td><Td>approval ב-high-risk</Td><Td>"✅ אשר ובצע" על כל action</Td><Td><Ok /></Td></tr>
            <tr><Td>Domain-specific extension</Td><Td>—</Td><Td>Production schema (Season/Episode/Scene/Character)</Td><Td><Ok /> יתרון שלנו</Td></tr>
          </tbody>
        </table>
      </Section>

      {/* 10. Recommendations */}
      <Section id="recommendations" title="10. המלצות לשיפור ושימור — מצב יישום">
        <ol className="space-y-4 text-sm list-decimal pr-5">
          <li>
            <b className="text-white">Calibration + Abstention</b> <Ok /> — שדה <Code>confidence: 0-1</Code> נכלל עכשיו בכל action שהמוח מחזיר.
            Executor חוסם אוטומטית פעולות עם confidence &lt; 0.65 ומחזיר ”תצטרך לשאול שאלת הבהרה“.
          </li>
          <li>
            <b className="text-white">Version history על BrainReference</b> <Ok /> — טבלת <Code>BrainReferenceVersion</Code> נוצרה.
            כל PATCH שומר snapshot של הגרסה הקודמת. <Code>POST /api/v1/learn/reference/[id]</Code> עם <Code>rollbackToVersion</Code> מחזיר לגרסה היסטורית.
          </li>
          <li>
            <b className="text-white">Validity intervals</b> <Ok /> — <Code>BrainReference</Code> קיבל <Code>validFrom</Code> / <Code>validTo</Code> / <Code>supersedes</Code> / <Code>version</Code>.
            DELETE עכשיו soft-delete (מעדכן <Code>validTo=now</Code>). רשימת GET מסננת ארכיון אוטומטית (אלא אם <Code>?includeArchived=1</Code>).
          </li>
          <li>
            <b className="text-white">TTL + Retention policy</b> <Ok /> — Cron חדש <Code>/api/v1/learn/cron/retention</Code> ב-04:00 UTC יומי.
            Hot=30 ימים · Passive=90 ימים · Archive=לצמיתות. אחרי 90 ימים, BrainChat ישן מסומן כ-summarized והודעות אמצע נחתכות ל-120 תווים.
          </li>
          <li>
            <b className="text-white">Persona ↔ Truth split</b> <Gap>בתהליך</Gap> — פיצול <Code>buildSystemPrompt()</Code> ל-
            <Code>buildPersonaLayer()</Code> + <Code>buildTruthLayer()</Code>. כרגע השכבות מעורבבות.
          </li>
          <li>
            <b className="text-white">Eval harness</b> <Gap>לא מיושם</Gap> — 50 שאלות eval עם ground-truth, הרצה שבועית.
          </li>
          <li>
            <b className="text-white">JSON-LD / PROV-O provenance</b> <Gap>לא מיושם</Gap> — ייצוא <Code>@context</Code> + <Code>prov:generatedAtTime</Code> כשנדרש audit.
          </li>
        </ol>
      </Section>

      {/* 11. Conclusions */}
      <Section id="conclusions" title="11. מסקנות">
        <p className="mb-3">
          המערכת שלנו מממשת <b>כ-70%</b> מההמלצות של המודל התיאורטי, כבר ב-production, עם:
        </p>
        <ul className="space-y-1 text-sm list-disc pr-5 mb-4">
          <li>הפרדה נכונה בין מודל שפה (Gemini) ל-truth layer (Prisma + BrainReference)</li>
          <li>3 שכבות זיכרון מפורשות + ארכיון append-only</li>
          <li>RAG פונקציונלי עם 89 רפרנסים מובנים + {data.knowledgeNodes.toLocaleString()} Knowledge Nodes</li>
          <li>Action executor עם 7 פעולות אמיתיות — לא רק ”צ׳אטבוט שכותב“</li>
          <li>Observability מלא (ApiUsage + Logs + Insights + Consciousness)</li>
          <li>auth bridge נקי + safety sanitizer על מודלי וידאו</li>
          <li>Domain-specific production schema — יתרון שלא קיים במודל התיאורטי</li>
        </ul>
        <p className="mb-3">
          ה-<b>30% החסרים</b> הם בעיקר: מדידה פורמלית (calibration/ECE/eval-set), truth-history עם intervals, ופיצול פרסונה-מאמת.
          כולם ברי-השגה <b>בלי rearchitecting</b> — ברובם זה הוספת שדה ל-schema + wrapper ב-systemPrompt.
        </p>
        <p className="text-sm text-slate-400">
          מסמך זה נגיש גם למוח עצמו דרך <Link href="/learn/brain/chat" className="text-cyan-400 hover:underline">/learn/brain/chat</Link> —
          אפשר לשאול אותו ”מה ההבדל בין התיעוד שלנו למודל התיאורטי?“ והוא יצטט מתוך סעיפים 9-10.
        </p>
      </Section>

      {/* References */}
      <Section id="refs" title="מקורות מחקר שאוזכרו">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400">
          <a href="https://arxiv.org/abs/2005.11401" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">RAG (Lewis et al. 2020)</a>
          <a href="https://arxiv.org/abs/2002.08909" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">REALM (Guu et al. 2020)</a>
          <a href="https://arxiv.org/abs/2210.03629" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">ReAct (Yao et al. 2022)</a>
          <a href="https://arxiv.org/abs/2302.04761" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Toolformer (Schick et al. 2023)</a>
          <a href="https://arxiv.org/abs/2309.02427" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">CoALA (Sumers et al. 2023)</a>
          <a href="https://arxiv.org/abs/2310.08560" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">MemGPT (Packer et al. 2023)</a>
          <a href="https://arxiv.org/abs/2304.03442" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Generative Agents (Park et al. 2023)</a>
          <a href="https://arxiv.org/abs/2307.03172" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Lost in the Middle (Liu et al. 2023)</a>
          <a href="https://arxiv.org/abs/2104.08663" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">BEIR (Thakur et al. 2021)</a>
          <a href="https://arxiv.org/abs/2312.05497" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Temporal Knowledge Editing (2023)</a>
          <a href="https://www.w3.org/TR/json-ld11/" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">JSON-LD 1.1 (W3C)</a>
          <a href="https://www.w3.org/TR/prov-o/" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">PROV-O (W3C)</a>
        </div>
      </Section>
    </article>
  );
}

function Kpi({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
      <div className="text-2xl font-black text-cyan-300">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{label}</div>
    </div>
  );
}
