"use client";

import { useState } from "react";

export default function PrintButton({ slug, title }: { slug: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  async function downloadPdf() {
    setBusy(true);
    setStage("📸 מצלם את המדריך…");
    try {
      // Lazy-load html2pdf only when the button is clicked — keeps the
      // initial bundle small since this is a rare action.
      const html2pdf = (await import("html2pdf.js")).default;
      const article = document.querySelector("article");
      if (!article) throw new Error("article element not found");

      setStage("🎨 בונה PDF עם צבעים ועיצוב…");
      const filename = `${(title || slug).replace(/[^a-zA-Z0-9\u0590-\u05FF\s-]/g, "").trim().slice(0, 80) || slug}.pdf`;

      // Capture the article at higher scale for crisp text + code blocks.
      // backgroundColor matches the slate-950 dark theme of the page so the
      // PDF keeps the original "night" styling rather than plain white.
      await html2pdf()
        .from(article as HTMLElement)
        .set({
          margin: [12, 10, 12, 10],
          filename,
          image: { type: "jpeg", quality: 0.96 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#020617",
            logging: false,
          },
          jsPDF: {
            unit: "mm",
            format: "a4",
            orientation: "portrait",
            compress: true,
          },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .save();

      setStage("✅ הורד!");
      setTimeout(() => { setStage(""); setBusy(false); }, 1000);
    } catch (e) {
      console.error("[pdf]", e);
      setStage("⚠ שגיאה — נסה שוב");
      setTimeout(() => { setStage(""); setBusy(false); }, 2000);
    }
  }

  return (
    <button
      onClick={downloadPdf}
      disabled={busy}
      className="text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded disabled:opacity-60"
      title="הורד את המדריך כקובץ PDF (עם צבעים ועיצוב)"
    >
      {busy ? (stage || "⏳ יוצר PDF…") : "📥 PDF"}
    </button>
  );
}
