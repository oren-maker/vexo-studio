"use client";

import { useState } from "react";

type Block =
  | { kind: "text"; text: string }
  | { kind: "code"; lang: string; code: string };

function parseContent(src: string): Block[] {
  const blocks: Block[] = [];
  const re = /```(\w+)?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      const text = src.slice(last, m.index).trim();
      if (text) blocks.push({ kind: "text", text });
    }
    blocks.push({ kind: "code", lang: (m[1] || "text").toLowerCase(), code: m[2].replace(/\n+$/, "") });
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    const text = src.slice(last).trim();
    if (text) blocks.push({ kind: "text", text });
  }
  return blocks.length > 0 ? blocks : [{ kind: "text", text: src }];
}

function renderInline(text: string) {
  // Bold: **word** → <strong>word</strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function TextBlock({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  return (
    <div className="space-y-4 text-slate-200 leading-relaxed text-base">
      {paragraphs.map((p, i) => {
        // Bullet list
        if (/^[-•]\s/m.test(p) && p.split("\n").every((ln) => /^[-•]\s/.test(ln) || !ln.trim())) {
          const items = p.split("\n").filter((ln) => /^[-•]\s/.test(ln)).map((ln) => ln.replace(/^[-•]\s+/, ""));
          return (
            <ul key={i} className="list-disc pr-6 space-y-1">
              {items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(p)}
          </p>
        );
      })}
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="my-4 rounded-lg overflow-hidden border border-slate-800 bg-slate-950" dir="ltr">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-slate-900/60">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{lang}</span>
        <button
          onClick={copy}
          className="text-[10px] text-slate-400 hover:text-cyan-300 px-2 py-0.5 rounded"
        >
          {copied ? "✓ הועתק" : "📋 העתק"}
        </button>
      </div>
      <pre className="p-4 text-sm text-slate-100 overflow-x-auto font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function StageContent({ content }: { content: string }) {
  if (!content) return null;
  const blocks = parseContent(content);
  return (
    <div>
      {blocks.map((b, i) =>
        b.kind === "code" ? (
          <CodeBlock key={i} lang={b.lang} code={b.code} />
        ) : (
          <TextBlock key={i} text={b.text} />
        )
      )}
    </div>
  );
}
