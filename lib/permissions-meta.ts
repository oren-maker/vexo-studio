import type { Lang } from "./i18n";

export type PermissionCategory =
  | "workspace"
  | "finance"
  | "providers"
  | "content"
  | "production"
  | "distribution"
  | "ai"
  | "logs"
  | "platform";

export interface PermissionMeta {
  key: string;
  category: PermissionCategory;
  icon: string;
  labelEn: string;
  labelHe: string;
  descEn: string;
  descHe: string;
}

export const PERMISSION_REGISTRY: PermissionMeta[] = [
  // Workspace
  { key: "manage_users",          category: "workspace",    icon: "👥", labelEn: "Manage users",            labelHe: "ניהול משתמשים",          descEn: "Invite, edit, deactivate org members.",         descHe: "הזמנה, עריכה והשבתה של חברי הארגון." },
  { key: "manage_roles",          category: "workspace",    icon: "🔐", labelEn: "Manage roles",            labelHe: "ניהול תפקידים",          descEn: "Edit role-permission mappings.",                descHe: "עריכת תפקידים והרשאות." },
  { key: "manage_organization",   category: "workspace",    icon: "🏢", labelEn: "Manage organization",     labelHe: "ניהול ארגון",            descEn: "Edit org settings, plan and branding.",         descHe: "עריכת הגדרות הארגון, התוכנית והמיתוג." },

  // Finance
  { key: "view_finance",          category: "finance",      icon: "📊", labelEn: "View finance",            labelHe: "צפייה בכספים",            descEn: "See costs, revenue, profit, ROI.",              descHe: "צפייה בעלויות, הכנסות, רווח ותשואה." },
  { key: "manage_finance",        category: "finance",      icon: "💰", labelEn: "Manage finance",          labelHe: "ניהול כספים",             descEn: "Add costs/revenue manually, configure splits.",  descHe: "הוספת עלויות/הכנסות והגדרת חלוקת רווחים." },
  { key: "manage_tokens",         category: "finance",      icon: "🪙", labelEn: "Manage credits",          labelHe: "ניהול קרדיטים",            descEn: "Top up provider wallets and reconcile usage.",   descHe: "טעינת ארנקי ספקים וניהול שימוש." },

  // Providers
  { key: "manage_providers",      category: "providers",    icon: "🔌", labelEn: "Manage providers",        labelHe: "ניהול ספקים",             descEn: "Add/remove AI providers and rotate keys.",       descHe: "הוספה/הסרה של ספקי AI והחלפת מפתחות." },

  // Content
  { key: "create_project",        category: "content",      icon: "🆕", labelEn: "Create project",          labelHe: "יצירת פרויקט",            descEn: "Start a new series, course or kids show.",       descHe: "התחלת סדרה, קורס או תוכן ילדים חדש." },
  { key: "edit_project",          category: "content",      icon: "✏️", labelEn: "Edit project",            labelHe: "עריכת פרויקט",            descEn: "Modify project details, scenes, scripts.",       descHe: "עריכת פרטי הפרויקט, סצנות וסקריפטים." },
  { key: "delete_project",        category: "content",      icon: "🗑️", labelEn: "Delete project",          labelHe: "מחיקת פרויקט",            descEn: "Archive a project (soft delete).",               descHe: "ארכוב פרויקט (מחיקה רכה)." },
  { key: "manage_templates",      category: "content",      icon: "🧩", labelEn: "Manage templates",        labelHe: "ניהול תבניות",            descEn: "Save / publish project templates.",              descHe: "שמירה ופרסום של תבניות פרויקט." },
  { key: "manage_calendar",       category: "content",      icon: "📅", labelEn: "Manage calendar",         labelHe: "ניהול לוח שנה",           descEn: "Schedule episodes for publish.",                  descHe: "תזמון פרקים לפרסום." },

  // Production
  { key: "generate_assets",       category: "production",   icon: "🎨", labelEn: "Generate assets",         labelHe: "יצירת נכסים",             descEn: "Trigger AI generation jobs (storyboard/video/etc.).", descHe: "הפעלת עבודות יצירה AI (storyboard/וידאו/וכו׳)." },
  { key: "approve_scene",         category: "production",   icon: "✅", labelEn: "Approve scene",           labelHe: "אישור סצנה",              descEn: "Approve a scene to advance its status.",          descHe: "אישור סצנה כדי לקדם אותה בסטטוס." },
  { key: "manage_music",          category: "production",   icon: "🎵", labelEn: "Manage music",            labelHe: "ניהול מוזיקה",            descEn: "Generate, edit and select music tracks.",         descHe: "יצירה, עריכה ובחירה של פסקול." },
  { key: "manage_subtitles",      category: "production",   icon: "💬", labelEn: "Manage subtitles",        labelHe: "ניהול כתוביות",           descEn: "Generate and edit subtitle tracks.",              descHe: "יצירה ועריכה של כתוביות." },
  { key: "manage_dubbing",        category: "production",   icon: "🗣️", labelEn: "Manage dubbing",          labelHe: "ניהול דיבוב",             descEn: "Generate and review dubbing tracks.",             descHe: "יצירה וביקורת של דיבוב." },

  // Distribution
  { key: "manage_distribution",   category: "distribution", icon: "📡", labelEn: "Manage distribution",     labelHe: "ניהול הפצה",              descEn: "Connect channels and configure publishing.",      descHe: "חיבור ערוצים והגדרת פרסום." },
  { key: "publish_episode",       category: "distribution", icon: "🚀", labelEn: "Publish episode",         labelHe: "פרסום פרק",               descEn: "Push an episode live to YouTube/TikTok/Vimeo.",   descHe: "פרסום פרק לערוצים." },

  // AI
  { key: "manage_ai_director",    category: "ai",           icon: "🤖", labelEn: "Manage AI Director",      labelHe: "ניהול הבמאי האוטונומי",   descEn: "Configure and run the AI production agent.",      descHe: "הגדרה והפעלה של סוכן ההפקה האוטונומי." },
  { key: "view_audience_insights",category: "ai",           icon: "👁️", labelEn: "View audience insights",  labelHe: "תובנות צופים",            descEn: "Read AI-generated audience analysis.",            descHe: "צפייה בניתוח קהל שנוצר ע״י AI." },

  // Logs
  { key: "view_logs",             category: "logs",         icon: "📋", labelEn: "View logs",               labelHe: "צפייה ביומנים",           descEn: "Read audit logs and AI activity logs.",            descHe: "צפייה ביומני ביקורת ופעולות AI." },

  // Platform
  { key: "manage_api_keys",       category: "platform",     icon: "🔑", labelEn: "Manage API keys",         labelHe: "ניהול מפתחות API",        descEn: "Issue and revoke API keys.",                       descHe: "הנפקה וביטול של מפתחות API." },
  { key: "manage_webhooks",       category: "platform",     icon: "🪝", labelEn: "Manage webhooks",         labelHe: "ניהול Webhooks",          descEn: "Subscribe to outbound platform events.",          descHe: "מינוי לאירועי פלטפורמה יוצאים." },
];

export const CATEGORY_META: Record<PermissionCategory, { en: string; he: string; color: string }> = {
  workspace:    { en: "Workspace",     he: "סביבת עבודה",   color: "#0091d4" },
  finance:      { en: "Finance",       he: "כספים",          color: "#1db868" },
  providers:    { en: "Providers",     he: "ספקים",          color: "#f0a500" },
  content:      { en: "Content",       he: "תוכן",           color: "#6366F1" },
  production:   { en: "Production",    he: "הפקה",           color: "#e83e8c" },
  distribution: { en: "Distribution",  he: "הפצה",           color: "#00c8f0" },
  ai:           { en: "AI",            he: "בינה מלאכותית",  color: "#7c3aed" },
  logs:         { en: "Logs",          he: "יומנים",         color: "#9aaabf" },
  platform:     { en: "Platform",      he: "פלטפורמה",       color: "#1a2540" },
};

export function getPermissionMeta(key: string): PermissionMeta | undefined {
  return PERMISSION_REGISTRY.find((p) => p.key === key);
}

export function permLabel(key: string, lang: Lang): string {
  const p = getPermissionMeta(key);
  if (!p) return key;
  return lang === "he" ? p.labelHe : p.labelEn;
}

export function permDesc(key: string, lang: Lang): string {
  const p = getPermissionMeta(key);
  if (!p) return "";
  return lang === "he" ? p.descHe : p.descEn;
}

export function categoryLabel(cat: PermissionCategory, lang: Lang): string {
  return lang === "he" ? CATEGORY_META[cat].he : CATEGORY_META[cat].en;
}

/** Group permissions by category, preserving registry order. */
export function groupPermissions(keys: string[]): Record<PermissionCategory, PermissionMeta[]> {
  const out = {} as Record<PermissionCategory, PermissionMeta[]>;
  for (const k of keys) {
    const meta = getPermissionMeta(k);
    if (!meta) continue;
    if (!out[meta.category]) out[meta.category] = [];
    out[meta.category].push(meta);
  }
  return out;
}

export const ROLE_LABELS_HE: Record<string, string> = {
  SUPER_ADMIN: "מנהל-על",
  ADMIN: "מנהל",
  DIRECTOR: "במאי",
  CONTENT_EDITOR: "עורך תוכן",
  AI_OPERATOR: "מפעיל AI",
  FINANCE_VIEWER: "צופה כספים",
  VIEWER: "צופה",
};
export function roleLabel(name: string, lang: Lang): string {
  if (lang === "he" && ROLE_LABELS_HE[name]) return ROLE_LABELS_HE[name];
  return name;
}
