"use client";

// Auto-linkify text that the brain produces. Turns:
//   - absolute URLs (https://…)
//   - in-app paths (/learn/..., /seasons/..., /characters/..., /guides/...)
//   - bare IDs that match the cuid/uuid pattern are left as plain text
// into <a> elements so Oren can click instead of copy-paste.
// Keeps everything else (newlines, markdown-ish chars) intact.

import React from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"'`]+)|((?:^|\s)(\/(?:learn|seasons|characters|guides|admin|video|api)[^\s<>"'`]*))/g;

export function linkifyText(text: string): React.ReactNode {
  if (!text) return text;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  // Reset per invocation
  URL_PATTERN.lastIndex = 0;

  while ((m = URL_PATTERN.exec(text)) !== null) {
    const match = m[0];
    const url = m[1] ?? m[3];
    const leading = m[2] ? m[2].slice(0, m[2].length - (url?.length ?? 0)) : "";
    const start = m.index + (leading ? leading.length : 0);

    if (start > lastIdx) parts.push(text.slice(lastIdx, start));
    if (leading) {
      // emit the leading whitespace before the path (e.g. a newline/space)
      parts.push(text.slice(m.index, m.index + leading.length));
    }
    if (url) {
      const href = url.startsWith("http") ? url : url;
      parts.push(
        <a
          key={`lnk-${start}`}
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noreferrer" : undefined}
          className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 break-all"
        >
          {url}
        </a>
      );
    }
    lastIdx = m.index + match.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}
