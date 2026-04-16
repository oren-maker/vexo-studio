"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded"
      title="הדפס / שמור כ-PDF (Ctrl/Cmd+P)"
    >
      📥 PDF
    </button>
  );
}
