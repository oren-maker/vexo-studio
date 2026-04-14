"use client";
/**
 * DOM-level live translator. Walks the document's text nodes, batches them
 * to /api/v1/ai/translate, swaps in Hebrew. Caches in localStorage.
 * Uses a MutationObserver so dynamic UI gets translated on every re-render.
 */
import { useEffect } from "react";
import { useLang } from "@/lib/i18n";

const STORAGE_KEY = "vexo_tr_he_v2";
const ENDPOINT = "/api/v1/ai/translate";
const BATCH_SIZE = 50;
const BATCH_DELAY = 120; // ms

let cache: Record<string, string> = {};
const pending = new Set<string>();
let inFlight = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadCache() {
  if (typeof window === "undefined") return;
  try { cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { cache = {}; }
}
function saveCacheSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
  }, 300);
}

function token(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/vexo_at=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function shouldTranslate(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  // Skip if already contains Hebrew
  if (/[\u0590-\u05FF]/.test(t)) return false;
  // Must contain at least 2 Latin letters
  const latinCount = (t.match(/[A-Za-z]/g) ?? []).length;
  if (latinCount < 2) return false;
  // Skip pure CSS class-like / identifier-like / URL-like / email
  if (/^[\w.-]+$/.test(t) && !/\s/.test(t)) return false;
  if (/@.*\./.test(t)) return false; // email
  if (/^https?:\/\//i.test(t)) return false;
  return true;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "INPUT", "NOSCRIPT", "SVG", "PATH"]);

function walkAndCollect(root: Node, list: { node: Text; original: string }[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const parent = (n as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-no-translate]')) return NodeFilter.FILTER_REJECT;
      const t = (n.textContent ?? "");
      if (!shouldTranslate(t)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const node = n as Text;
    list.push({ node, original: (node.textContent ?? "").trim() });
  }
}

function applyToNode(item: { node: Text; original: string }) {
  const tr = cache[item.original];
  if (!tr) return false;
  const original = item.node.textContent ?? "";
  // Preserve original whitespace
  const replaced = original.replace(item.original, tr);
  if (item.node.textContent !== replaced) item.node.textContent = replaced;
  return true;
}

async function flush() {
  if (inFlight || pending.size === 0) return;
  inFlight = true;
  const batch = [...pending].slice(0, BATCH_SIZE);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      body: JSON.stringify({ texts: batch, target: "he" }),
    });
    if (res.ok) {
      const data = await res.json();
      const translations: string[] = data.translations ?? [];
      batch.forEach((src, i) => {
        const tr = translations[i];
        if (typeof tr === "string" && tr.trim()) cache[src] = tr;
        pending.delete(src);
      });
      saveCacheSoon();
      // Re-walk to apply
      const items: { node: Text; original: string }[] = [];
      walkAndCollect(document.body, items);
      items.forEach(applyToNode);
    } else {
      batch.forEach((s) => pending.delete(s));
    }
  } catch {
    batch.forEach((s) => pending.delete(s));
  } finally {
    inFlight = false;
    if (pending.size > 0) setTimeout(flush, 50);
  }
}

let scanTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    const items: { node: Text; original: string }[] = [];
    walkAndCollect(document.body, items);
    let added = 0;
    for (const item of items) {
      if (cache[item.original]) {
        applyToNode(item);
      } else if (!pending.has(item.original)) {
        pending.add(item.original);
        added++;
      }
    }
    if (added > 0 || pending.size > 0) setTimeout(flush, BATCH_DELAY);
  }, 80);
}

export function DomTranslator() {
  const lang = useLang();
  useEffect(() => {
    if (lang !== "he") return;
    loadCache();
    scheduleScan();
    const obs = new MutationObserver((muts) => {
      let needsScan = false;
      for (const m of muts) {
        if (m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) needsScan = true;
        else if (m.type === "characterData") needsScan = true;
      }
      if (needsScan) scheduleScan();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [lang]);
  return null;
}
