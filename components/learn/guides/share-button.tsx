"use client";

import { useEffect, useRef, useState } from "react";

export default function ShareButton({ slug, title }: { slug: string; title: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "fallback">("idle");
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/guides/${slug}`);
  }, [slug]);

  async function share() {
    if (!url) return;
    // 1) Native share sheet (mobile + some desktops)
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: title || "מדריך", url });
        return;
      } catch {
        // user canceled or unsupported — fall through
      }
    }
    // 2) Clipboard API
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
      return;
    } catch {
      // 3) Clean inline fallback — reveal the URL in a selectable input.
      // NO window.prompt(), which looks like a password/code dialog.
      setStatus("fallback");
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={share}
        className="text-xs bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded"
      >
        {status === "copied" ? "✓ הקישור הועתק" : "🔗 שתף"}
      </button>
      {status === "fallback" && (
        <div className="absolute top-full mt-2 right-0 z-50 w-72 bg-slate-900 border border-cyan-500/40 rounded-lg p-3 shadow-xl">
          <div className="text-[11px] text-slate-400 mb-2">סמן + Ctrl/Cmd+C כדי להעתיק:</div>
          <input
            ref={inputRef}
            readOnly
            value={url}
            onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono"
          />
          <button
            onClick={() => setStatus("idle")}
            className="mt-2 text-[10px] text-slate-500 hover:text-slate-300"
          >
            סגור
          </button>
        </div>
      )}
    </div>
  );
}
