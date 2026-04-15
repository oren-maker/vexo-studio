import { notFound } from "next/navigation";
import { prisma } from "@/lib/learn/db";
import PrintTrigger from "./print-trigger";

export const dynamic = "force-dynamic";

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { auto?: string };
}) {
  const source = await prisma.learnSource.findUnique({
    where: { id: params.id },
    include: { analysis: true },
  });
  if (!source) notFound();

  const auto = searchParams.auto === "1";
  const a = source.analysis;

  return (
    <div className="print-root" dir="auto">
      {auto && <PrintTrigger />}

      <style>{`
        /* Print stylesheet — overrides the app's dark theme for paper */
        @page { size: A4; margin: 18mm; }
        html, body { background: #ffffff !important; }
        body { color: #0f172a !important; }
        .print-root { max-width: 760px; margin: 0 auto; padding: 24px; background: #fff; color: #0f172a; font-family: 'Heebo', Arial, sans-serif; }
        .print-root h1 { font-size: 22pt; font-weight: 800; margin-bottom: 6px; color: #0f172a; }
        .print-root h2 { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin: 18px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .print-root .meta { color: #64748b; font-size: 9pt; }
        .print-root .badge { display: inline-block; background: #f1f5f9; color: #334155; padding: 2px 8px; border-radius: 4px; font-size: 8pt; margin: 0 4px 4px 0; }
        .print-root .prompt-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-family: 'SF Mono', Consolas, monospace; font-size: 9.5pt; white-space: pre-wrap; line-height: 1.55; direction: ltr; text-align: left; color: #0f172a; }
        .print-root .caption-block { background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; font-size: 10pt; line-height: 1.7; direction: rtl; text-align: right; }
        .print-root .row { display: grid; grid-template-columns: 100px 1fr; gap: 8px; font-size: 10pt; margin-bottom: 4px; }
        .print-root .row .k { color: #64748b; }
        .print-root .row .v { color: #0f172a; font-weight: 500; }
        .print-root .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; text-align: center; }
        .print-root thead { background: #f1f5f9; }
        .print-root .techniques { display: flex; flex-wrap: wrap; gap: 4px; }
        .no-print { display: block; }
        @media print {
          .no-print { display: none !important; }
          .print-root { padding: 0; }
        }
        a { color: #2563eb; text-decoration: underline; }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20, padding: 12, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: "11pt" }}>
        💡 דף מוכן להדפסה / שמירה כ-PDF. לחץ <b>Ctrl+P</b> (או ⌘P ב-Mac) ובחר &quot;Save as PDF&quot;.
        {auto && " — הדיאלוג יופיע אוטומטית."}
      </div>

      <header style={{ marginBottom: 18 }}>
        <div className="meta">VEXO Learn · {new Date().toLocaleDateString("he-IL")}</div>
        <h1>{source.title || "(ללא כותרת)"}</h1>
        <div className="meta">
          מקור: {source.url ? (
            <a href={source.url} target="_blank">{source.url}</a>
          ) : "ידני"}
          {source.addedBy && <> · {source.addedBy}</>}
        </div>
      </header>

      {a && (
        <>
          {(a.style || a.mood || a.difficulty) && (
            <div style={{ marginBottom: 16 }}>
              {a.style && <div className="row"><span className="k">סגנון</span><span className="v">{a.style}</span></div>}
              {a.mood && <div className="row"><span className="k">Mood</span><span className="v">{a.mood}</span></div>}
              {a.difficulty && <div className="row"><span className="k">רמת קושי</span><span className="v">{a.difficulty}</span></div>}
            </div>
          )}

          {a.description && (
            <>
              <h2>תקציר</h2>
              <p style={{ fontSize: "10.5pt", lineHeight: 1.6 }}>{a.description}</p>
            </>
          )}
        </>
      )}

      <h2>Prompt</h2>
      <div className="prompt-block">{source.prompt}</div>

      {a && a.techniques.length > 0 && (
        <>
          <h2>טכניקות</h2>
          <div className="techniques">
            {a.techniques.map((t) => <span key={t} className="badge">{t}</span>)}
          </div>
        </>
      )}

      {a && a.howTo.length > 0 && (
        <>
          <h2>How-to</h2>
          <ol style={{ paddingRight: "20px", fontSize: "10pt", lineHeight: 1.6 }}>
            {a.howTo.map((h, i) => <li key={i} style={{ marginBottom: 4 }}>{h}</li>)}
          </ol>
        </>
      )}

      {a && a.insights.length > 0 && (
        <>
          <h2>תובנות</h2>
          <ul style={{ paddingRight: "20px", fontSize: "10pt", lineHeight: 1.6 }}>
            {a.insights.map((h, i) => <li key={i} style={{ marginBottom: 4 }}>{h}</li>)}
          </ul>
        </>
      )}

      {a && a.tags.length > 0 && (
        <>
          <h2>תגיות</h2>
          <div className="techniques">
            {a.tags.map((t) => <span key={t} className="badge">#{t}</span>)}
          </div>
        </>
      )}

      <div className="footer">
        נוצר ע״י VEXO Learn · vexo-learn.vercel.app · ID: {source.id}
      </div>
    </div>
  );
}
