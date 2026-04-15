import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

export default async function VideoLanding() {
  const jobs = await prisma.mergeJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { _count: { select: { clips: true } } },
  });

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">🎥 וידאו</h1>
        <p className="text-sm text-slate-400 mt-1">עריכה, מיזוג ועיבוד וידאו — מודול עצמאי, לא מתחבר ל-Learn.</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <FeatureCard
          href="/video/merge"
          icon="🎬"
          title="מיזוג קליפים"
          desc="העלאת מספר קליפים, סידור, חיתוך, טרנזישנים, ופלט אחד."
          status="active"
        />
        <FeatureCard
          href="/video/merge"
          icon="✨"
          title="AI Transitions"
          desc="מעברים חלקים ע״י Luma Ray-2 בין clips. בחר 'AI Luma' ב-dropdown של ה-transition."
          status="active"
        />
        <FeatureCard
          href="/video/trim"
          icon="✂️"
          title="טרים מתקדם"
          desc="Scene detection אוטומטי + Gemini Flash מדרג כל סצנה."
          status="active"
        />
      </section>

      <section className="mb-8 bg-slate-900/40 border border-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white mb-3">מה ההבדל בין שלושת המצבים?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-cyan-400 font-bold mb-2">🎬 מיזוג קליפים</div>
            <p className="text-slate-300 leading-relaxed">
              העלאת כמה קליפים, סידור בציר זמן, חיתוך בתוך כל קליפ, הוספת טרנזישנים פשוטים (fade / cut) ופלט אחד מאוחד.
              זה עורך וידאו קלאסי — אתה שולט בסדר, זמנים ומעברים. ללא עלות AI.
            </p>
          </div>
          <div>
            <div className="text-cyan-400 font-bold mb-2">✨ AI Transitions (Luma Ray-2)</div>
            <p className="text-slate-300 leading-relaxed">
              אותו דף מיזוג, אבל במקום טרנזישן פשוט — בוחרים &quot;AI Luma&quot; ב-dropdown של ה-transition וה-AI של
              Luma Ray-2 מייצר מעבר חלק וחכם בין קליפים (morph / blend / continuation).
              עלות API נוספת לכל מעבר.
            </p>
          </div>
          <div>
            <div className="text-cyan-400 font-bold mb-2">✂️ טרים מתקדם</div>
            <p className="text-slate-300 leading-relaxed">
              מעלים סרטון אחד ארוך וה-AI מזהה אוטומטית חתכים (Scene Detection) ומחלק לסצנות.
              Gemini Flash קורא את התוכן של כל סצנה ונותן ציון — אתה רואה את כל הסצנות עם הציונים ומחליט איזו לשמור.
              חיתוך חכם במקום ידני.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
          <strong className="text-slate-300">בקיצור:</strong>{" "}
          מיזוג = מחברים קליפים ידנית · AI Transitions = אותו מיזוג + מעברים מ-AI · טרים מתקדם = AI חותך סרטון ארוך לסצנות מדורגות.
          שני הראשונים חיים באותו דף (<span className="text-cyan-400 font-mono">/video/merge</span>), השלישי בדף נפרד (<span className="text-cyan-400 font-mono">/video/trim</span>).
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-3">פרויקטים אחרונים</h2>
        {jobs.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
            <div className="text-4xl mb-2">🎬</div>
            <p className="text-sm text-slate-400 mb-4">אין עדיין פרויקטים. צור את הראשון.</p>
            <Link href="/video/merge" className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2 rounded-lg text-sm">
              ➕ פרויקט חדש
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/video/jobs/${j.id}`}
                  className="flex items-center justify-between bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-sm"
                >
                  <div>
                    <div className="text-white font-medium">פרויקט {j.id.slice(0, 8)}…</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {new Date(j.createdAt).toLocaleString("he-IL")} · {j._count.clips} clips · engine: {j.engine}
                    </div>
                  </div>
                  <StatusPill status={j.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FeatureCard({ href, icon, title, desc, status }: { href: string; icon: string; title: string; desc: string; status: "active" | "soon" }) {
  const isActive = status === "active";
  const Outer: any = isActive ? Link : "div";
  return (
    <Outer
      {...(isActive ? { href } : {})}
      className={`bg-slate-900/60 border rounded-xl p-5 block transition ${
        isActive ? "border-cyan-500/40 hover:border-cyan-400 hover:bg-slate-900/80 cursor-pointer" : "border-slate-800 opacity-60"
      }`}
    >
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-white font-bold mb-1 flex items-center gap-2">
        {title}
        {!isActive && <span className="text-[9px] uppercase bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">בקרוב</span>}
      </div>
      <div className="text-xs text-slate-400">{desc}</div>
    </Outer>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-slate-700 text-slate-300",
    uploading: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
    processing: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40",
    complete: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
    failed: "bg-red-500/20 text-red-300 border border-red-500/40",
  };
  return (
    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${map[status] || "bg-slate-700 text-slate-300"}`}>
      {status}
    </span>
  );
}
