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

export const QUEUE_NAMES = {
  STORYBOARD: "storyboard-generation",
  VIDEO: "video-generation",
  MUSIC: "music-generation",
  SUBTITLE: "subtitle-generation",
  DUBBING: "dubbing-generation",
  LIPSYNC: "lip-sync-generation",
  AVATAR: "avatar-generation",
  CRITIC: "critic-review",
  PUBLISHING: "publishing",
  ANALYTICS: "analytics-sync",
  MEMORY: "memory-refresh",
  RECAP: "recap-generation",
} as const;
