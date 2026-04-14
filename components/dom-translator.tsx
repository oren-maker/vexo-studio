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
const BATCH_SIZE = 30;
const BATCH_DELAY = 120; // ms

let cache: Record<string, string> = {};
const pending = new Set<string>();
let inFlight = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadCache() {
  if (typeof window === "undefined") return;
  try { cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { cache = {}; }
  // Purge entries that never should have been translated (codes, versions, short alphanumerics)
  let dirty = false;
  for (const k of Object.keys(cache)) {
    if (!shouldTranslate(k)) { delete cache[k]; dirty = true; }
  }
  if (dirty) saveCacheSoon();
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
  // Skip URLs and emails
  if (/@.*\./.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  // Skip very long alphanumeric blobs (CUIDs, hashes) with no spaces/punct
  if (!/\s/.test(t) && /^[a-z0-9]{20,}$/i.test(t)) return false;
  // Skip short codes like EP01, SC05, S1E3, V2 — 2-4 letters immediately followed by digits, optional suffix
  if (/^[A-Z]{1,4}\d+[A-Za-z0-9]*$/.test(t)) return false;
  // Skip version tags like v1.2.3, 4.5
  if (/^v?\d+(\.\d+)+$/i.test(t)) return false;
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
  // If cached "translation" is just the English source (no Hebrew chars), invalidate + queue retranslate.
  if (tr === item.original || !/[\u0590-\u05FF]/.test(tr)) {
    delete cache[item.original];
    saveCacheSoon();
    pending.add(item.original);
    setTimeout(flush, 80);
    return false;
  }
  const original = item.node.textContent ?? "";
  const replaced = original.replace(item.original, tr);
  if (item.node.textContent !== replaced) item.node.textContent = replaced;
  return true;
}

const ATTRS_TO_TRANSLATE = ["title", "aria-label", "placeholder", "alt"];

function walkAttributes(root: Element, list: { el: Element; attr: string; original: string }[]) {
  const all = root.querySelectorAll<Element>("*");
  const els: Element[] = [root, ...Array.from(all)];
  for (const el of els) {
    if (SKIP_TAGS.has(el.tagName)) continue;
    if (el.closest('[data-no-translate]')) continue;
    for (const attr of ATTRS_TO_TRANSLATE) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      const t = v.trim();
      if (!shouldTranslate(t)) continue;
      list.push({ el, attr, original: t });
    }
  }
}

function applyAttr(item: { el: Element; attr: string; original: string }) {
  const tr = cache[item.original];
  if (!tr) return false;
  if (tr === item.original || !/[\u0590-\u05FF]/.test(tr)) {
    delete cache[item.original];
    saveCacheSoon();
    pending.add(item.original);
    setTimeout(flush, 80);
    return false;
  }
  const cur = item.el.getAttribute(item.attr) ?? "";
  const replaced = cur.replace(item.original, tr);
  if (cur !== replaced) item.el.setAttribute(item.attr, replaced);
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
      // Re-walk to apply text + attrs
      const items: { node: Text; original: string }[] = [];
      walkAndCollect(document.body, items);
      items.forEach(applyToNode);
      const attrs: { el: Element; attr: string; original: string }[] = [];
      walkAttributes(document.body, attrs);
      attrs.forEach(applyAttr);
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
    const attrs: { el: Element; attr: string; original: string }[] = [];
    walkAttributes(document.body, attrs);
    let added = 0;
    for (const item of items) {
      if (cache[item.original]) applyToNode(item);
      else if (!pending.has(item.original)) { pending.add(item.original); added++; }
    }
    for (const a of attrs) {
      if (cache[a.original]) applyAttr(a);
      else if (!pending.has(a.original)) { pending.add(a.original); added++; }
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
