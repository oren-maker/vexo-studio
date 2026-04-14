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
