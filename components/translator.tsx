"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Cache = Record<string, string>;
const STORAGE_KEY = "vexo_tr_he_v1";

function loadCache(): Cache {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
function saveCache(c: Cache) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

interface Ctx {
  enabled: boolean;
  get: (text: string) => string | undefined;
  request: (text: string) => void;
  version: number;
}
const TRC = createContext<Ctx>({ enabled: false, get: () => undefined, request: () => {}, version: 0 });

export function TranslatorProvider({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  const enabled = lang === "he";
  const cacheRef = useRef<Cache>({});
  const [version, setVersion] = useState(0);
  const pendingRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<boolean>(false);

  // Hydrate cache once
  useEffect(() => { cacheRef.current = loadCache(); setVersion((v) => v + 1); }, []);

  const flush = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    const batch = [...pendingRef.current].slice(0, 60);
    if (batch.length === 0) return;
    inFlightRef.current = true;
    try {
      const r = await api<{ translations: string[] }>("/api/v1/ai/translate", {
        method: "POST",
        body: { texts: batch, target: "he" },
      });
      const cache = cacheRef.current;
      batch.forEach((src, i) => {
        const tr = r.translations[i];
        if (typeof tr === "string" && tr.trim()) cache[src] = tr;
        pendingRef.current.delete(src);
      });
      saveCache(cache);
      setVersion((v) => v + 1);
    } catch {
      // Drop batch on error so we don't hot-loop
      batch.forEach((s) => pendingRef.current.delete(s));
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current.size > 0) setTimeout(flush, 50);
    }
  }, [enabled]);

  const request = useCallback((text: string) => {
    if (!enabled) return;
    if (cacheRef.current[text]) return;
    if (pendingRef.current.has(text)) return;
    pendingRef.current.add(text);
    // Debounce coalescing
    setTimeout(flush, 80);
  }, [enabled, flush]);

  const ctx = useMemo<Ctx>(() => ({
    enabled,
    get: (text: string) => cacheRef.current[text],
    request,
    version,
  }), [enabled, request, version]);

  return <TRC.Provider value={ctx}>{children}</TRC.Provider>;
}

/** Recursively translates every plain-text child + key string attrs (placeholder/title/aria-label). */
export function AutoT({ children }: { children: React.ReactNode }) {
  const ctx = useContext(TRC);

  function collect(node: React.ReactNode, acc: string[]): void {
    if (node == null || typeof node === "boolean" || typeof node === "number") return;
    if (typeof node === "string") {
      const s = node.trim();
      if (s.length > 1 && /[A-Za-z]/.test(s)) acc.push(node);
      return;
    }
    if (Array.isArray(node)) { node.forEach((c) => collect(c, acc)); return; }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      const props = node.props as Record<string, unknown> & { children?: React.ReactNode };
      collect(props.children, acc);
      for (const attr of ["placeholder", "title", "aria-label"]) {
        const v = props[attr];
        if (typeof v === "string" && /[A-Za-z]/.test(v) && v.trim().length > 1) acc.push(v);
      }
    }
  }

  function transform(node: React.ReactNode): React.ReactNode {
    if (node == null || typeof node === "boolean" || typeof node === "number") return node;
    if (typeof node === "string") {
      if (!ctx.enabled) return node;
      const s = node.trim();
      if (s.length <= 1 || !/[A-Za-z]/.test(s)) return node;
      return ctx.get(node) ?? node;
    }
    if (Array.isArray(node)) {
      return node.map((c, i) => <React.Fragment key={i}>{transform(c)}</React.Fragment>);
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      const props = node.props as Record<string, unknown> & { children?: React.ReactNode };
      const newChildren = transform(props.children);
      const extra: Record<string, unknown> = {};
      if (ctx.enabled) {
        for (const attr of ["placeholder", "title", "aria-label"]) {
          const v = props[attr];
          if (typeof v === "string" && /[A-Za-z]/.test(v)) {
            extra[attr] = ctx.get(v) ?? v;
          }
        }
      }
      return React.cloneElement(node, extra, newChildren);
    }
    return node;
  }

  useEffect(() => {
    if (!ctx.enabled) return;
    const acc: string[] = [];
    collect(children, acc);
    for (const t of acc) ctx.request(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, ctx.enabled, ctx.version]);

  return <>{transform(children)}</>;
}

/** Translate a string. If user lang == he, returns Hebrew (or English while loading). */
export function useTr(text?: string | null): string {
  const ctx = useContext(TRC);
  useEffect(() => {
    if (text && ctx.enabled) ctx.request(text);
  }, [text, ctx]);
  if (!text) return "";
  if (!ctx.enabled) return text;
  return ctx.get(text) ?? text;
}

/** Translates literal children. Children must be a string or a single text node. */
export function T({ children, fallback }: { children?: React.ReactNode; fallback?: string }) {
  const text = typeof children === "string" ? children : (typeof children === "number" ? String(children) : (fallback ?? ""));
  const tr = useTr(text);
  return <>{tr}</>;
}
