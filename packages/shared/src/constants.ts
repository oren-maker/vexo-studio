export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "DIRECTOR",
  "CONTENT_EDITOR",
  "AI_OPERATOR",
  "FINANCE_VIEWER",
  "VIEWER",
] as const;
export type RoleName = (typeof ROLES)[number];

export const PERMISSIONS = [
  "manage_users",
  "manage_roles",
  "manage_providers",
  "manage_tokens",
  "view_finance",
  "manage_finance",
  "create_project",
  "edit_project",
  "delete_project",
  "manage_distribution",
  "generate_assets",
  "approve_scene",
  "publish_episode",
  "manage_ai_director",
  "view_logs",
  "manage_music",
  "manage_subtitles",
  "manage_dubbing",
  "manage_api_keys",
  "manage_webhooks",
  "manage_organization",
  "manage_templates",
  "manage_calendar",
  "view_audience_insights",
] as const;
export type PermissionKey = (typeof PERMISSIONS)[number];

export const PROVIDER_CATEGORIES = [
  "VIDEO",
  "IMAGE",
  "AUDIO",
  "DUBBING",
  "MUSIC",
  "SUBTITLE",
  "DISTRIBUTION",
] as const;

export const ORG_PLANS = ["FREE", "PRO", "STUDIO", "ENTERPRISE"] as const;
export type OrgPlanName = (typeof ORG_PLANS)[number];

export const PLAN_LIMITS: Record<OrgPlanName, { maxProjects: number; maxEpisodes: number; autopilot: boolean; whitelabel: boolean }> = {
  FREE:       { maxProjects: 1,    maxEpisodes: 3,    autopilot: false, whitelabel: false },
  PRO:        { maxProjects: 5,    maxEpisodes: 9999, autopilot: true,  whitelabel: false },
  STUDIO:     { maxProjects: 9999, maxEpisodes: 9999, autopilot: true,  whitelabel: false },
  ENTERPRISE: { maxProjects: 9999, maxEpisodes: 9999, autopilot: true,  whitelabel: true  },
};

export const QUEUE_NAMES = {
  STORYBOARD:        "storyboard-generation",
  VIDEO:             "video-generation",
  MUSIC:             "music-generation",
  SUBTITLE:          "subtitle-generation",
  DUBBING:           "dubbing-generation",
  LIPSYNC:           "lip-sync-generation",
  AVATAR:            "avatar-generation",
  DIALOGUE:          "dialogue-generation",
  CRITIC:            "critic-review",
  SEO:               "seo-generation",
  STYLE_SNAPSHOT:    "style-snapshot",
  SCRIPT_BREAKDOWN:  "script-breakdown",
  PUBLISHING:        "publishing",
  ANALYTICS:         "analytics-sync",
  AUDIENCE_INSIGHTS: "audience-insights",
  MEMORY:            "memory-refresh",
  RECAP:             "recap-generation",
  WEBHOOK_DELIVERY:  "webhook-delivery",
  INCOMING_WEBHOOK:  "incoming-webhook",
} as const;

export const QUEUE_PRIORITY: Record<string, number> = {
  "publishing": 1,
  "lip-sync-generation": 2,
  "incoming-webhook": 2,
  "video-generation": 3,
  "webhook-delivery": 3,
  "storyboard-generation": 4,
  "dubbing-generation": 4,
  "music-generation": 5,
  "subtitle-generation": 5,
  "avatar-generation": 5,
  "dialogue-generation": 5,
  "critic-review": 6,
  "seo-generation": 6,
  "style-snapshot": 7,
  "script-breakdown": 7,
  "analytics-sync": 8,
  "audience-insights": 8,
  "memory-refresh": 9,
  "recap-generation": 9,
};

export const NOTIFICATION_TYPES = [
  "JOB_DONE",
  "JOB_FAILED",
  "EPISODE_READY",
  "BUDGET_WARNING",
  "PUBLISH_SUCCESS",
] as const;

export const WEBHOOK_EVENTS = [
  "episode.published",
  "episode.failed",
  "job.completed",
  "job.failed",
  "scene.approved",
  "budget.warning",
] as const;
