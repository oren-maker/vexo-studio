"use client";
import { useEffect } from "react";
import { useDir, useLang } from "@/lib/i18n";

/** Sets <html lang> and <html dir> based on the current user's preferred language. */
export function RtlEffect() {
  const dir = useDir();
  const lang = useLang();
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    return () => { document.documentElement.dir = "ltr"; document.documentElement.lang = "en"; };
  }, [dir, lang]);
  return null;
}
