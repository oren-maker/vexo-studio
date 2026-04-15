export const GUIDE_LANGUAGES = [
  { code: "he", name: "עברית", flag: "🇮🇱", rtl: true },
  { code: "en", name: "English", flag: "🇺🇸", rtl: false },
  { code: "ar", name: "العربية", flag: "🇸🇦", rtl: true },
  { code: "es", name: "Español", flag: "🇪🇸", rtl: false },
  { code: "ru", name: "Русский", flag: "🇷🇺", rtl: false },
] as const;

export type GuideLang = typeof GUIDE_LANGUAGES[number]["code"];
export const DEFAULT_LANG: GuideLang = "he";

export function isRtl(lang: string): boolean {
  return GUIDE_LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
}

export function langName(code: string): string {
  return GUIDE_LANGUAGES.find((l) => l.code === code)?.name || code;
}

export function isValidLang(code: string): code is GuideLang {
  return GUIDE_LANGUAGES.some((l) => l.code === code);
}
