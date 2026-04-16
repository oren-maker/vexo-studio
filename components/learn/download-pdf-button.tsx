"use client";

import { useState } from "react";

export default function DownloadPdfButton({ sourceId, hasCached }: { sourceId: string; hasCached?: boolean }) {
  const [busy, setBusy] = useState(false);

  function download(force = false) {
    const url = force
      ? `/api/v1/learn/sources/${sourceId}/pdf?force=1`
      : `/api/v1/learn/sources/${sourceId}/pdf`;
    setBusy(true);
    // Open in new tab — if cached the redirect is instant; otherwise generates + redirects
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => setBusy(false), 3000);
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => download(false)}
        disabled={busy}
        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm border border-slate-700 disabled:opacity-50"
        title={hasCached ? "פתח PDF שמור" : "צור ושמור PDF"}
      >
        {busy ? "🔄 טוען..." : hasCached ? "📄 פתח PDF" : "📄 צור PDF"}
      </button>
      {hasCached && (
        <button
          onClick={() => download(true)}
          disabled={busy}
          className="bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg text-xs border border-slate-700 disabled:opacity-50"
          title="צור גרסה חדשה (יקח כמה שניות)"
        >
          🔁
        </button>
      )}
    </div>
  );
}
