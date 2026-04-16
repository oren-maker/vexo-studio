import Link from "next/link";
import { unstable_cache } from "next/cache";
import { computeCorpusInsights } from "@/lib/learn/corpus-insights";
import { prisma } from "@/lib/learn/db";
import InsightsFreshness from "@/components/learn/insights-freshness";
import ModuleHeader from "@/components/learn/module-header";

// Page is heavy (scans all LearnSource + VideoAnalysis rows). Cache the
// computation for 10 minutes — the hourly cron snapshot already refreshes
// the stored data on its own cadence, so a 10-minute read cache is fine.
export const revalidate = 600;

const getInsights = unstable_cache(
  async () => computeCorpusInsights(),
  ["learn-insights-v1"],
  { revalidate: 600, tags: ["learn-insights"] }
);

export default async function InsightsPage() {
  const [insights, latestSnapshot, snapshotCount, seriesAnalysis, references] = await Promise.all([
    getInsights(),
    prisma.insightsSnapshot.findFirst({ where: { kind: "hourly" }, orderBy: { takenAt: "desc" }, select: { takenAt: true, summary: true } }),
    prisma.insightsSnapshot.count(),
    prisma.insightsSnapshot.findFirst({ where: { kind: "series_analysis" }, orderBy: { takenAt: "desc" }, select: { takenAt: true, summary: true } }),
    prisma.brainReference.findMany({
      where: { kind: { in: ["emotion", "sound", "cinematography", "capability"] } },
      orderBy: [{ kind: "asc" }, { order: "asc" }],
      select: { kind: true, name: true, shortDesc: true, tags: true },
    }),
  ]);
  const byKind: Record<string, typeof references> = { emotion: [], sound: [], cinematography: [], capability: [] };
  for (const r of references) (byKind[r.kind] ??= []).push(r);
  const t = insights.totals;

  if (t.sources === 0) {
    return (
      <div className="max-w-4xl mx-auto p-10 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">תובנות</h1>
        <p className="text-slate-400">צריך להריץ ניתוח דפוסים קודם ב-<Link href="/learn/sync" className="text-cyan-400 underline">/learn/sync</Link>.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <ModuleHeader title="👁 תובנות" operations={["knowledge-extract", "insights-snapshot" as any]} logsTab="snapshots" />
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">תובנות על המאגר</h1>
          <p className="text-sm text-slate-400 mt-1">
            ניתוח צולב של כל {t.sources} הפרומפטים. <b>זו הלמידה האמיתית</b> — דפוסים שמופיעים על פני המאגר כולו, לא תיוג של פרומפט בודד.
          </p>
          <p className="text-[11px] text-slate-500 mt-2">
            🕐 המערכת עושה snapshot כל שעה ושומרת היסטוריה. פתח{" "}
            <Link href="/learn/logs?tab=snapshots" className="text-cyan-400 hover:underline">לוגי תובנות</Link>
            {" "}או{" "}
            <Link href="/learn/consciousness" className="text-cyan-400 hover:underline">תודעה</Link>
            {" "}כדי לראות את כל ההיסטוריה.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/learn/logs"
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-700"
          >
            📂 כל הלוגים
          </Link>
          <Link
            href="/learn/consciousness"
            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs px-3 py-2 rounded-lg"
          >
            🧠 תודעה
          </Link>
        </div>
      </header>

      <InsightsFreshness
        lastTakenAt={latestSnapshot?.takenAt.toISOString() || null}
        snapshotIndex={snapshotCount}
        snapshotTotal={snapshotCount}
        summary={latestSnapshot?.summary || null}
      />

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi value={t.avgTechniquesPerPrompt} label="ממוצע טכניקות/פרומפט" accent="cyan" />
        <Kpi value={t.avgWordsPerPrompt} label="ממוצע מילים/פרומפט" accent="purple" />
        <Kpi value={`${Math.round((t.promptsWithTimecodes / t.sources) * 100)}%`} label="עם timecodes" accent="emerald" />
        <Kpi value={t.knowledgeNodes} label="Knowledge Nodes" accent="amber" />
      </div>

      {/* Director capabilities — the full cross-domain stack the brain uses */}
      <Section
        title="🎬 יכולות הבמאי"
        subtitle="כל שכבות הידע מצטלבות — רגשות × סאונד × צילום × יכולות = המפיק/במאי/עורך/סאונדמן ביחד. המוח קורא אותן בכל שיחה."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <CapabilityCard emoji="😊" label="רגשות" count={byKind.emotion.length} accent="emerald" sample={byKind.emotion.slice(0, 4).map((r) => r.name)} href="/learn/knowledge?tab=emotion" />
          <CapabilityCard emoji="🔊" label="סאונד" count={byKind.sound.length} accent="cyan" sample={byKind.sound.slice(0, 4).map((r) => r.name)} href="/learn/knowledge?tab=sound" />
          <CapabilityCard emoji="🎥" label="צילום" count={byKind.cinematography.length} accent="purple" sample={byKind.cinematography.slice(0, 4).map((r) => r.name)} href="/learn/knowledge?tab=cinematography" />
          <CapabilityCard emoji="⚙️" label="יכולות מערכת" count={byKind.capability.length} accent="amber" sample={byKind.capability.slice(0, 4).map((r) => r.name)} href="/learn/knowledge?tab=capability" />
        </div>
        <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/5 border border-purple-500/30 rounded-xl p-5">
          <div className="text-[11px] text-purple-300 uppercase tracking-wider mb-2 font-semibold">סינתזה — איך כל השכבות מייצרות תובנות חדשות</div>
          <ul className="space-y-2 text-sm text-slate-200 leading-relaxed">
            <li>
              <b className="text-emerald-300">רגשות × צילום:</b> {byKind.emotion.length * byKind.cinematography.length} צירופים אפשריים. לכל רגש מותאמת קומפוזיציה (כעס → Low Angle + Dutch, חמלה → Close-Up רך + Medium Shot, פחד → POV + Shallow DoF).
            </li>
            <li>
              <b className="text-cyan-300">סאונד × רגש:</b> {byKind.sound.length * byKind.emotion.length} שילובים. הסאונד אחראי על ~40% מעוצמת הרגש — לחישה + מוזיקה נמוכה מעצימה פחד, Sidechain Duck שומר דיאלוג רגיש על מוזיקה.
            </li>
            <li>
              <b className="text-purple-300">צילום × סאונד:</b> מעבר Whip Pan + Whoosh מחברים בין סצנות; L-Cut של דיאלוג לתוך Close-Up יוצר רציפות רגשית; Dolly In איטי + Score עולה = רגע שיא.
            </li>
            <li>
              <b className="text-amber-300">יכולות × הכל:</b> {byKind.capability.length} פעולות מערכת ({byKind.capability.filter((c) => c.tags?.includes("וידאו")).length} וידאו · {byKind.capability.filter((c) => c.tags?.includes("brain")).length} מוח · {byKind.capability.filter((c) => c.tags?.includes("מדריך")).length} מדריך) מחברות את הידע לפעולה — compose_prompt יודע לשלב את כל השכבות באותו פרומפט.
            </li>
            <li className="pt-2 border-t border-purple-500/20 text-slate-300 italic">
              סה״כ: <b className="text-white">{byKind.emotion.length + byKind.sound.length + byKind.cinematography.length + byKind.capability.length} פריטי ידע מובנה</b> שמוזרמים לכל שיחה עם המוח. זה ההבדל בין "צ'אטבוט שכותב פרומפט" ל"במאי/מפיק/עורך סאונד/יוצר ראשי שמחלק לעצמו את העבודה".
            </li>
          </ul>
        </div>
      </Section>

      {/* Derived rules - THE learning */}
      <Section title="כללים שנגזרו מהנתונים" subtitle="מה המאגר מלמד אותנו על איך נראה פרומפט טוב">
        <ol className="space-y-3">
          {(insights.derivedRules ?? []).map((rule, i) => (
            <li key={i} className="flex gap-3 items-start bg-slate-900/60 border border-slate-800 rounded-lg p-4">
              <span className="text-cyan-400 font-bold text-lg shrink-0">#{i + 1}</span>
              <span className="text-slate-100 text-sm leading-relaxed">{rule}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Technique co-occurrence */}
      {(insights.cooccurrencePairs ?? []).length > 0 && (
        <Section title="שילובי טכניקות מובילים" subtitle="זוגות שמופיעים יחד משמעותית יותר מהסיכוי האקראי (lift ≥ 1.2)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(insights.cooccurrencePairs ?? []).map((p, i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                <div className="text-sm text-white">
                  <span className="text-cyan-300">{p.a}</span>
                  <span className="text-slate-500 mx-2">+</span>
                  <span className="text-purple-300">{p.b}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400">{p.count}×</span>
                  <span className={`font-mono font-semibold ${p.lift >= 2 ? "text-emerald-300" : "text-amber-300"}`}>
                    lift ×{p.lift.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            <b>Lift</b> = כמה יותר ממה שצפוי אם הן היו עצמאיות. 2.0 = פי 2 מהסיכוי האקראי.
          </p>
        </Section>
      )}

      {/* Style profiles */}
      <Section title="פרופיל לכל סגנון" subtitle="מה מאפיין בפועל כל סגנון במאגר — signature phrases מופיעות בסגנון זה פי 1.8+ מבכלל המאגר">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(insights.styleProfiles ?? []).map((p) => (
            <div key={p.style} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">{p.style}</h3>
                <span className="text-xs text-slate-400">{p.count} פרומפטים</span>
              </div>
              <div className="text-xs text-slate-400 mb-2">
                ממוצע {p.avgTechniquesPerPrompt} טכניקות · {difficultyLabel(p.difficultyMix)}
              </div>
              {p.signaturePhrases.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase text-emerald-400 font-semibold mb-1">Signature</div>
                  <div className="flex flex-wrap gap-1">
                    {p.signaturePhrases.map((s) => (
                      <span key={s} className="text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <MiniList label="טכניקות" items={p.topTechniques.map((x) => `${x.name} (${x.freqPct}%)`)} />
                {p.topMoods.length > 0 && <MiniList label="moods" items={p.topMoods.map((x) => `${x.name} (${x.freqPct}%)`)} />}
                {p.topTags.length > 0 && <MiniList label="נושאים" items={p.topTags.map((x) => `${x.name} (${x.freqPct}%)`)} />}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Gaps - where to invest */}
      {(insights.gaps ?? []).length > 0 && (
        <Section title="פערים במאגר" subtitle="איפה VEXO Director יקבל context חלש — הוסף עוד פרומפטים שם">
          <ul className="space-y-2">
            {(insights.gaps ?? []).map((g, i) => (
              <li key={i} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">{g.dimension}</span>
                  <span className="text-white font-medium">{g.value}</span>
                  <span className="text-slate-400 text-xs">· {g.currentCount} פרומפטים (חציון: {g.medianCount})</span>
                </div>
                <p className="text-slate-300 text-xs">{g.suggestion}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Top performers */}
      <Section title="פרומפטים מובילים" subtitle="דורגו לפי richness score — כמות טכניקות + timecodes + אורך">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(insights.topPerformers ?? []).map((tp, i) => (
            <Link
              key={tp.sourceId}
              href={`/learn/sources/${tp.sourceId}`}
              className="flex gap-3 items-center bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 rounded-lg p-3 transition"
            >
              <div className="text-2xl font-black text-cyan-300 w-8 text-center">#{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium line-clamp-1">{tp.title || "(ללא כותרת)"}</div>
                <div className="text-[11px] text-slate-500 flex gap-3 mt-0.5">
                  <span>🎯 {tp.techniqueCount} טכניקות</span>
                  {tp.hasTimecodes && <span>⏱ timecodes</span>}
                  <span>📝 {tp.wordCount} מילים</span>
                </div>
              </div>
              <div className="text-lg font-bold text-purple-300">{tp.richnessScore}</div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Strategic insights from Gemini 2.5 Pro */}
      {insights.strategicInsights && (insights.strategicInsights ?? []).length > 0 && (
        <Section title="🧠 תובנות אסטרטגיות מ-Gemini 2.5 Pro" subtitle="ניתוח עומק מבוסס AI על בסיס כל הסטטיסטיקות מעלה — מה לעשות עכשיו">
          <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/5 border border-purple-500/30 rounded-xl p-5">
            <ol className="space-y-3">
              {(insights.strategicInsights ?? []).map((s, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="text-purple-300 font-black text-lg shrink-0 leading-none">{i + 1}</span>
                  <span className="text-slate-100 text-sm leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      )}

      {/* Upgrade insights */}
      {insights.upgrades && insights.upgrades.totalUpgrades > 0 && (
        <Section title={`מה למדנו משדרוגי פרומפטים (${insights.upgrades.totalUpgrades} שדרוגים)`} subtitle="ניתוח חוצה-גרסאות של ה-PromptVersions — מה הוסיפו, מה הסירו, ואילו סעיפים צמחו">
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <UpgradeKpi value={insights.upgrades.totalUpgrades} label="סה״כ שדרוגים" accent="cyan" />
              <UpgradeKpi
                value={`${insights.upgrades.avgWordDelta > 0 ? "+" : ""}${insights.upgrades.avgWordDelta}`}
                label="ממוצע מילים נוספו"
                hint={`${insights.upgrades.avgWordPctDelta > 0 ? "+" : ""}${insights.upgrades.avgWordPctDelta}% גידול`}
                accent="emerald"
              />
              <UpgradeKpi value={insights.upgrades.avgLinesAdded} label="ממוצע שורות נוספו" accent="purple" />
              <UpgradeKpi value={insights.upgrades.avgLinesRemoved} label="ממוצע שורות הוסרו" accent="amber" />
            </div>

            {/* Patterns — human-readable Hebrew */}
            <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-4">
              <div className="text-[10px] uppercase text-cyan-400 mb-2 font-semibold">💡 כללים שנלמדו</div>
              <ul className="space-y-1.5 text-sm text-slate-200">
                {insights.upgrades.patterns.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-cyan-400 shrink-0">▸</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Section growth */}
            {insights.upgrades.sectionGrowth.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                <div className="text-[10px] uppercase text-slate-400 mb-3 font-semibold">📊 איזה סעיפים נוספים הכי הרבה</div>
                <div className="space-y-2">
                  {insights.upgrades.sectionGrowth.map((s) => (
                    <div key={s.section} className="text-xs">
                      <div className="flex justify-between text-slate-300 mb-0.5">
                        <span>{s.section}</span>
                        <span className="text-emerald-300 font-mono">+{s.addedPct}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-l from-emerald-500 to-cyan-500" style={{ width: `${s.addedPct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Added vs Removed phrases */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.upgrades.topAddedPhrases.length > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4">
                  <div className="text-[10px] uppercase text-emerald-400 mb-2 font-semibold">➕ ביטויים שנוספים הכי הרבה</div>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.upgrades.topAddedPhrases.map((p) => (
                      <span key={p.phrase} className="text-[11px] bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 px-2 py-1 rounded font-mono" dir="ltr">
                        {p.phrase} <span className="text-emerald-400">×{p.addedIn}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {insights.upgrades.topRemovedPhrases.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4">
                  <div className="text-[10px] uppercase text-red-400 mb-2 font-semibold">➖ ביטויים שמוסרים</div>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.upgrades.topRemovedPhrases.map((p) => (
                      <span key={p.phrase} className="text-[11px] bg-red-500/10 text-red-200 border border-red-500/30 px-2 py-1 rounded font-mono" dir="ltr">
                        {p.phrase} <span className="text-red-400">×{p.removedIn}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Trigger breakdown */}
            {Object.keys(insights.upgrades.byTrigger).length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-wrap gap-2">
                <span className="text-[10px] uppercase text-slate-500 font-semibold ml-2">לפי טריגר:</span>
                {Object.entries(insights.upgrades.byTrigger).map(([t, c]) => (
                  <span key={t} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono">
                    {t}: <b className="text-cyan-300">{c}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Frequency tables */}
      <Section title="תדירות במאגר" subtitle="הטכניקות/סגנונות/נושאים הנפוצים ביותר">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FreqList title="טכניקות" items={insights.topTechniques} colorClass="text-cyan-300" />
          <FreqList title="סגנונות" items={insights.topStyles} colorClass="text-purple-300" />
          <FreqList title="נושאים" items={insights.topTags} colorClass="text-emerald-300" />
        </div>
      </Section>
    </div>
  );
}

function UpgradeKpi({ value, label, hint, accent }: { value: any; label: string; hint?: string; accent: "cyan" | "purple" | "emerald" | "amber" }) {
  const colorMap = {
    cyan: "text-cyan-300",
    purple: "text-purple-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
      <div className={`text-2xl font-black ${colorMap[accent]}`}>{value}</div>
      <div className="text-xs text-slate-300 mt-0.5">{label}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function CapabilityCard({ emoji, label, count, accent, sample, href }: { emoji: string; label: string; count: number; accent: "emerald" | "cyan" | "purple" | "amber"; sample: string[]; href: string }) {
  const accentMap = {
    emerald: "text-emerald-300 border-emerald-500/30",
    cyan: "text-cyan-300 border-cyan-500/30",
    purple: "text-purple-300 border-purple-500/30",
    amber: "text-amber-300 border-amber-500/30",
  };
  return (
    <Link href={href} className={`bg-slate-900/60 border rounded-xl p-4 hover:bg-slate-900/80 transition block ${accentMap[accent]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-2xl">{emoji}</div>
        <div className={`text-3xl font-black ${accentMap[accent].split(" ")[0]}`}>{count}</div>
      </div>
      <div className="text-sm text-white font-semibold mb-2">{label}</div>
      <div className="flex flex-wrap gap-1">
        {sample.map((s) => (
          <span key={s} className="text-[10px] bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded truncate max-w-[120px]">{s}</span>
        ))}
      </div>
    </Link>
  );
}

function Kpi({ value, label, accent }: { value: any; label: string; accent: "cyan" | "purple" | "emerald" | "amber" }) {
  const colorMap = {
    cyan: "text-cyan-300",
    purple: "text-purple-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`text-3xl font-black ${colorMap[accent]}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mb-4">{subtitle}</p>}
      {children}
    </section>
  );
}

function MiniList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500 mb-1">{label}</div>
      <div className="text-xs text-slate-300">{items.join(" · ")}</div>
    </div>
  );
}

function FreqList({ title, items, colorClass }: { title: string; items: Array<{ name: string; count: number; pct: number }>; colorClass: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${colorClass}`}>{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.name} className="text-xs">
            <div className="flex justify-between text-slate-300 mb-0.5">
              <span className="truncate">{item.name}</span>
              <span className="text-slate-500 shrink-0 ml-2">{item.count} · {item.pct}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full ${colorClass.replace("text-", "bg-")}`} style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function difficultyLabel(mix: Record<string, number>): string {
  const total = mix.beginner + mix.intermediate + mix.advanced;
  if (total === 0) return "";
  const parts: string[] = [];
  if (mix.beginner) parts.push(`${Math.round((mix.beginner / total) * 100)}% מתחילים`);
  if (mix.intermediate) parts.push(`${Math.round((mix.intermediate / total) * 100)}% בינוני`);
  if (mix.advanced) parts.push(`${Math.round((mix.advanced / total) * 100)}% מתקדם`);
  return parts.join(" · ");
}
