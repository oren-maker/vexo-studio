"use client";

import { useState } from "react";

export default function ShareButton({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/guides/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: title || "מדריך", url });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("העתק את הקישור:", url);
    }
  }

  return (
    <button
      onClick={share}
      className="text-xs bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 px-3 py-1.5 rounded"
    >
      {copied ? "✓ הקישור הועתק" : "🔗 שתף"}
    </button>
  );
}
