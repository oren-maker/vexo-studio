"use client";
import React from "react";

// Zero-dependency minimal markdown renderer for brain chat.
// Handles: **bold**, *italic*, `inline code`, simple - / * bullet lists,
// ## headings. Keeps lines as-is otherwise so paragraphs stay visual.
// Anything more (tables, links, nested) falls through as plain text so
// we don't silently mangle prompt content.

const INLINE_RX = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

function renderInline(text: string, key: React.Key): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  INLINE_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RX.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(<strong key={`${key}-b-${m.index}`} className="font-bold text-inherit">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      parts.push(<code key={`${key}-c-${m.index}`} className="bg-slate-800 text-amber-300 px-1 rounded text-[0.9em] font-mono">{tok.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={`${key}-i-${m.index}`} className="italic">{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function MarkdownInline({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc list-inside space-y-0.5 my-1">
        {listBuffer.map((ln, i) => <li key={i}>{renderInline(ln, `${blocks.length}-${i}`)}</li>)}
      </ul>,
    );
    listBuffer = [];
  };

  lines.forEach((ln, i) => {
    const bullet = ln.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { listBuffer.push(bullet[1]); return; }
    flushList();
    const heading = ln.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      const lvl = heading[1].length;
      const cls = lvl === 2 ? "text-base font-bold mt-2" : "text-sm font-semibold mt-1";
      blocks.push(<div key={`h-${i}`} className={cls}>{renderInline(heading[2], `h-${i}`)}</div>);
      return;
    }
    if (ln.trim() === "") { blocks.push(<div key={`br-${i}`} className="h-1.5" />); return; }
    blocks.push(<div key={i}>{renderInline(ln, `ln-${i}`)}</div>);
  });
  flushList();
  return <div className="space-y-0.5">{blocks}</div>;
}
