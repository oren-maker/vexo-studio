"use client";
import { useMe } from "@/components/auth-guard";

export type Lang = "en" | "he";

const DICT = {
  en: {
    // Topbar / nav
    "admin": "Admin",
    "admin.console": "Admin Console",
    "back.admin": "← Back to Admin",
    "back.projects": "← Back to Projects",
    "sign.out": "Sign out",
    "two.factor": "Two-factor auth",
    "sessions": "Sessions",

    // Sidebar sections
    "section.workspace": "Workspace",
    "section.content": "Content",
    "section.platform": "Platform",
    "section.account": "Account",

    // Sidebar items
    "nav.dashboard": "Dashboard",
    "nav.users": "Users",
    "nav.roles": "Roles & Permissions",
    "nav.providers": "Providers & Tokens",
    "nav.wallets": "Budgets & Wallets",
    "nav.projects": "Projects",
    "nav.new.project": "+ New project",
    "nav.templates": "Templates",
    "nav.notifications": "Notifications",
    "nav.api.keys": "API Keys",
    "nav.webhooks": "Webhooks",
    "nav.audit.logs": "Audit Logs",
    "nav.sessions": "Sessions",
    "nav.2fa": "Two-Factor Auth",

    // Common
    "loading": "Loading…",
    "save": "Save",
    "create": "Create",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "active": "Active",
    "inactive": "Inactive",
    "all": "All",
    "language": "Language",

    // Pages
    "templates.title": "Templates",
    "templates.subtitle": "Your saved templates + public marketplace",
    "templates.empty": "No templates yet.",

    "projects.title": "All projects",
    "projects.subtitle": "Series, courses and kids content",
    "projects.empty.title": "No projects in this view.",
    "projects.button.new": "+ New project",
  },
  he: {
    "admin": "ניהול",
    "admin.console": "מסוף ניהול",
    "back.admin": "→ חזרה לניהול",
    "back.projects": "→ חזרה לפרויקטים",
    "sign.out": "התנתקות",
    "two.factor": "אימות דו-שלבי",
    "sessions": "כניסות פעילות",

    "section.workspace": "סביבת עבודה",
    "section.content": "תוכן",
    "section.platform": "פלטפורמה",
    "section.account": "חשבון",

    "nav.dashboard": "לוח בקרה",
    "nav.users": "משתמשים",
    "nav.roles": "תפקידים והרשאות",
    "nav.providers": "ספקים וטוקנים",
    "nav.wallets": "תקציבים וארנקים",
    "nav.projects": "פרויקטים",
    "nav.new.project": "+ פרויקט חדש",
    "nav.templates": "תבניות",
    "nav.notifications": "התראות",
    "nav.api.keys": "מפתחות API",
    "nav.webhooks": "Webhooks",
    "nav.audit.logs": "יומן ביקורת",
    "nav.sessions": "כניסות",
    "nav.2fa": "אימות דו-שלבי",

    "loading": "טוען…",
    "save": "שמור",
    "create": "צור",
    "cancel": "בטל",
    "delete": "מחק",
    "edit": "ערוך",
    "active": "פעיל",
    "inactive": "לא פעיל",
    "all": "הכל",
    "language": "שפה",

    "templates.title": "תבניות",
    "templates.subtitle": "התבניות השמורות שלך + שוק ציבורי",
    "templates.empty": "אין תבניות עדיין.",

    "projects.title": "כל הפרויקטים",
    "projects.subtitle": "סדרות, קורסים ותכני ילדים",
    "projects.empty.title": "אין פרויקטים בתצוגה הזו.",
    "projects.button.new": "+ פרויקט חדש",
  },
} as const;

type Key = keyof typeof DICT["en"];

export function useLang(): Lang {
  const { me } = useMe();
  const lang = (me?.user as { language?: string } | undefined)?.language;
  return (lang === "he" ? "he" : "en");
}

export function useT(): (key: Key) => string {
  const lang = useLang();
  return (key: Key) => (DICT[lang] as Record<string, string>)[key] ?? key;
}

export function useDir(): "rtl" | "ltr" {
  return useLang() === "he" ? "rtl" : "ltr";
}
