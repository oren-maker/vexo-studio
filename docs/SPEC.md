# VEXO STUDIO — Full Technical Specification

> Canonical product/architecture spec. Source of truth for schema, endpoints, queues, services, frontend screens, design system, security and dev standards.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | TypeScript (Node.js) |
| Frontend | Next.js 14 (App Router) + React |
| ORM | Prisma |
| Database | PostgreSQL |
| Queue | BullMQ + Redis |
| Auth | JWT + Refresh Tokens |
| Storage | S3-compatible (presigned URLs) |
| Realtime | WebSocket / SSE for job updates |
| Validation | Zod |
| API Style | REST |
| Password Hashing | Argon2 |
| Encryption | AES-256 for provider keys and OAuth tokens |

## Architecture

### Layer Separation
`routes → middleware (auth + permissions) → controllers → services → repositories → Prisma`

### Module Structure
```
/apps
  /api      — Express/Fastify backend
  /web      — Next.js frontend
  /worker   — BullMQ worker process
/packages
  /db       — Prisma schema + migrations
  /queue    — BullMQ workers + job definitions
  /shared   — Zod schemas, types, constants
```

---

## Database Schema (Prisma)

See [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma) — all models live there. Sections:

1. Users & Auth — `User`, `Role`, `Permission`, `RolePermission`, `UserSession`, `AuditLog`
2. Providers & Wallets — `Provider`, `CreditWallet`, `CreditTransaction`, `AlertRule`, `AlertEvent`
3. Projects — `Project`, `ProjectSettings`
4. Series / Seasons / Episodes — `Series`, `Season`, `Episode`
5. Course — `Course`, `CourseModule`, `Lesson`
6. Scenes / Frames / Assets — `Scene`, `SceneFrame`, `Asset`, `SceneVersion`
7. Characters & Voices — `Character`, `CharacterMedia`, `CharacterVoice`
8. Music / Subtitles / Dubbing / Lip Sync — `MusicTrack`, `SubtitleTrack`, `DubbingTrack`, `LipSyncJob`
9. AI Director / Critic / Memory — `AIDirector`, `AILog`, `AICriticReview`, `ProjectMemory`, `RecapCandidate`
10. Distribution / Analytics / Finance — `ChannelIntegration`, `ProjectDistribution`, `PublishingJob`, `AnalyticsSnapshot`, `CostEntry`, `RevenueEntry`, `RevenueStream`, `RevenueSplit`

### Enums
`ContentType` (SERIES, COURSE, KIDS_CONTENT) · `ProjectStatus` (DRAFT, ACTIVE, PAUSED, ARCHIVED) · `AIMode` (MANUAL, ASSISTED, AUTOPILOT) · `EpisodeStatus` (DRAFT, PLANNING, IN_PRODUCTION, REVIEW, READY_FOR_PUBLISH, PUBLISHED, ARCHIVED) · `SceneStatus` (DRAFT, PLANNING, STORYBOARD_GENERATING, STORYBOARD_REVIEW, STORYBOARD_APPROVED, VIDEO_GENERATING, VIDEO_REVIEW, APPROVED, LOCKED)

---

## Roles & Permissions

**Roles**: `SUPER_ADMIN`, `ADMIN`, `DIRECTOR`, `CONTENT_EDITOR`, `AI_OPERATOR`, `FINANCE_VIEWER`, `VIEWER`

**Permission keys**: `manage_users`, `manage_roles`, `manage_providers`, `manage_tokens`, `view_finance`, `manage_finance`, `create_project`, `edit_project`, `delete_project`, `manage_distribution`, `generate_assets`, `approve_scene`, `publish_episode`, `manage_ai_director`, `view_logs`, `manage_music`, `manage_subtitles`, `manage_dubbing`

---

## API Endpoints

### Auth
```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/me
```

### Users
```
GET    /api/users
POST   /api/users
GET    /api/users/:id
PATCH  /api/users/:id
DELETE /api/users/:id
```

### Roles & Permissions
```
GET    /api/roles
POST   /api/roles
PATCH  /api/roles/:id
GET    /api/permissions
```

### Providers
```
GET    /api/providers
POST   /api/providers
PATCH  /api/providers/:id
DELETE /api/providers/:id
```

### Finance / Wallets
```
GET    /api/finance/wallets
POST   /api/finance/wallets
POST   /api/finance/wallets/:id/add
POST   /api/finance/wallets/:id/reduce
GET    /api/finance/wallets/:id/transactions
```

### Projects
```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
GET    /api/projects/:id/settings
PATCH  /api/projects/:id/settings
```

### Series / Seasons / Episodes
```
GET    /api/projects/:projectId/series
POST   /api/projects/:projectId/series
GET    /api/series/:id
PATCH  /api/series/:id

GET    /api/series/:seriesId/seasons
POST   /api/series/:seriesId/seasons
PATCH  /api/seasons/:id

GET    /api/seasons/:seasonId/episodes
POST   /api/seasons/:seasonId/episodes
GET    /api/episodes/:id
PATCH  /api/episodes/:id
POST   /api/episodes/:id/export
POST   /api/episodes/:id/publish
```

### Courses
```
GET    /api/projects/:projectId/courses
POST   /api/projects/:projectId/courses
POST   /api/courses/:id/modules
POST   /api/modules/:id/lessons
```

### Scenes & Frames
```
GET    /api/episodes/:episodeId/scenes
POST   /api/episodes/:episodeId/scenes
GET    /api/scenes/:id
PATCH  /api/scenes/:id
POST   /api/scenes/:id/approve
POST   /api/scenes/:id/generate-storyboard
POST   /api/scenes/:id/generate-video

GET    /api/scenes/:sceneId/frames
POST   /api/scenes/:sceneId/frames
PATCH  /api/frames/:id
POST   /api/frames/:id/regenerate
```

### Characters
```
GET    /api/projects/:projectId/characters
POST   /api/projects/:projectId/characters
PATCH  /api/characters/:id
POST   /api/characters/:id/generate-gallery
```

### Media Generation
```
POST   /api/scenes/:sceneId/music/generate
PATCH  /api/music/:id
POST   /api/episodes/:id/subtitles/generate
POST   /api/episodes/:id/dubbing/generate
POST   /api/scenes/:id/lipsync/generate
```

### AI Director / Critic / Memory
```
GET    /api/projects/:projectId/ai-director
PATCH  /api/projects/:projectId/ai-director
POST   /api/projects/:projectId/ai-director/run
GET    /api/projects/:projectId/ai-logs

POST   /api/scenes/:id/critic/review
POST   /api/episodes/:id/critic/review

GET    /api/projects/:projectId/memory
POST   /api/projects/:projectId/recap/generate
```

### Distribution / Analytics
```
GET    /api/integrations/channels
POST   /api/integrations/youtube/connect
GET    /api/projects/:projectId/distribution
PATCH  /api/projects/:projectId/distribution
POST   /api/episodes/:id/publish/youtube

GET    /api/projects/:id/analytics
GET    /api/series/:id/dashboard
GET    /api/episodes/:id/analytics
```

### Finance (project level)
```
GET    /api/projects/:id/finance/summary
GET    /api/projects/:id/finance/costs
POST   /api/projects/:id/finance/costs
GET    /api/projects/:id/finance/revenues
POST   /api/projects/:id/finance/revenues
GET    /api/projects/:id/finance/splits
POST   /api/projects/:id/finance/splits
```

---

## BullMQ Queues

| Queue | Purpose |
|---|---|
| `storyboard-generation` | Generate scene storyboard frames |
| `video-generation` | Generate scene/episode video |
| `music-generation` | Generate music track |
| `subtitle-generation` | Generate subtitles |
| `dubbing-generation` | Generate dubbing audio |
| `lip-sync-generation` | Run lip sync job |
| `avatar-generation` | Generate character gallery |
| `critic-review` | Run AI Critic on entity |
| `publishing` | Publish to YouTube/platform |
| `analytics-sync` | Sync YouTube analytics |
| `memory-refresh` | Update project memory |
| `recap-generation` | Generate episode recap |

### Base Job Schema
```ts
interface BaseJob {
  jobId: string;
  jobType: string;
  entityType: string;
  entityId: string;
  providerId?: string;
  payload: Record<string, unknown>;
  estimatedCost?: number;
  actualCost?: number;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  startedAt?: Date;
  completedAt?: Date;
  failedReason?: string;
}
```

Retry policy: 3 attempts, exponential backoff 5s / 30s / 120s.

---

## Provider Adapter Interface

```ts
interface ProviderAdapter {
  validateConnection(): Promise<boolean>;
  estimateCost(payload: unknown): Promise<number>;
  submitJob(payload: unknown): Promise<string>;
  getJobStatus(jobId: string): Promise<JobStatus>;
  fetchResult(jobId: string): Promise<unknown>;
  cancelJob(jobId: string): Promise<void>;
}
```

Stubs to implement: `fal`, `elevenlabs`, `suno`, `openai-tts`, `youtube`.

---

## Core Services

- **CostStrategyService** — `estimateSceneStoryboardCost`, `estimateSceneVideoCost`, `recommendQualityMode`, `recommendProvider`, `canAffordOperation`, `checkBudgetRisk`
- **RevenueEngine** — `calculateProfit`, `calculateROI`, `aggregateByEpisode`, `calculateSplitPayouts`
- **MemoryEngine** — `addMemory`, `getRelevantMemories`, `generateRecap`, `refreshProjectMemory`
- **AIDirectorService** — `runNextStep`, `buildEpisodeOutline`, `proposeScenes`, `triggerGeneration`, `preparePublishingPackage`
- **AICriticService** — `reviewScene`, `reviewEpisode`, `scoreNarrativeQuality`, `scoreContinuity`

---

## Workflow Rules

### Scene Flow
1. Created → `DRAFT`
2. `generate-storyboard` → `STORYBOARD_GENERATING` → job queued
3. Job done → `STORYBOARD_REVIEW`
4. User approves frames → `STORYBOARD_APPROVED`
5. `generate-video` → `VIDEO_GENERATING` → job queued
6. Job done → `VIDEO_REVIEW`
7. User approves → `APPROVED`
8. Lock → `LOCKED`

### Budget Rules
- Before every generation job → run `canAffordOperation()`
- If `budget_status = CRITICAL` → block job, return 402
- Only `ADMIN` can override budget block

### AI Director Autopilot Rules
- Every autonomous action logged to `ai_logs`
- Cannot publish without valid `ProjectDistribution` config
- Cannot exceed user permission scope
- Stoppable per project via `autopilotEnabled = false`

---

## Frontend Screens (Next.js App Router)

1. `/login`
2. `/admin` — admin dashboard
3. `/admin/users`
4. `/admin/roles`
5. `/admin/providers` — providers + wallets
6. `/projects`
7. `/projects/new`
8. `/projects/[id]`
9. `/projects/[id]/series/[seriesId]`
10. `/projects/[id]/series/[seriesId]/seasons/[seasonId]`
11. `/episodes/[id]`
12. `/scenes/[id]`
13. `/characters/[projectId]`
14. `/projects/[id]/finance`
15. `/projects/[id]/distribution`
16. `/projects/[id]/analytics`
17. `/projects/[id]/ai-director`
18. `/admin/logs`

---

## Design System

### Branding
- Product name: **VEXO Studio**
- Logo: "VEXO" bold dark-navy-to-blue gradient, "STUDIO" electric cyan below, metallic camera lens replacing the "O" wrapped in cyan orbital film-strip ring
- Logo placement: top-left of sidebar, always visible

### Layout
- **Sidebar**: fixed left, 260px, dark navy with subtle space/galaxy radial gradient
- **Topbar**: white, 64px, page title (left), search (center-right), notifications, avatar
- **Main**: white / `#f4f7fb`, scrollable, padding 24px
- **Cards**: white, `border-radius: 12px`, `box-shadow: 0 2px 12px rgba(0,0,0,0.06)`, 1px border `#e8edf5`

### Color Tokens
```css
:root {
  --sidebar-bg: #0d1b2e;
  --sidebar-bg-gradient: radial-gradient(ellipse at top, #1a2d4a 0%, #0d1b2e 70%);
  --sidebar-text: #c8d8ec;
  --sidebar-text-muted: #6a85a6;
  --sidebar-active-bg: rgba(0, 180, 230, 0.15);
  --sidebar-active-text: #00c8f0;
  --sidebar-active-border: #00c8f0;
  --sidebar-hover-bg: rgba(255,255,255,0.05);

  --bg-main: #f0f4f9;
  --bg-card: #ffffff;
  --bg-topbar: #ffffff;
  --border-card: #e2e8f2;
  --text-primary: #1a2540;
  --text-secondary: #556280;
  --text-muted: #9aaabf;

  --accent-primary: #0091d4;
  --accent-primary-light: #00b4e8;
  --accent-cyan: #00c8f0;
  --accent-cyan-glow: rgba(0, 200, 240, 0.25);

  --status-normal-bg: #e6f9f0;
  --status-normal-text: #1db868;
  --status-error-bg: #ffeef0;
  --status-error-text: #e03a4e;
  --status-warning-bg: #fff8e6;
  --status-warning-text: #f0a500;

  --chart-bar-budgeted: #1a6fba;
  --chart-bar-actual: #4bb8e8;
  --chart-line-revenue: #00c896;
  --chart-bar-variance-pos: #1db868;
  --chart-bar-variance-neg: #e03a4e;

  --kpi-cost-color: #e03a4e;
  --kpi-revenue-color: #1db868;
  --kpi-profit-color: #0091d4;
  --kpi-views-color: #1a2540;
}
```

### Typography
- Family: `Outfit` (primary) + `Inter` (numbers)
- Logo: SVG/image, not text
- Headings: Outfit 600–700
- Body: Outfit 400
- Numbers/KPIs: Inter 700, `font-variant-numeric: tabular-nums`
- Sidebar items: Outfit 500, 14px
- Table headers: uppercase, 11px, letter-spacing 0.08em, `--text-muted`

### Component Patterns
Sidebar nav item · KPI summary card · Status badge (normal/error/warning) · Provider/series table row · Cost & revenue chart (bars + line) · Series dashboard hero header · Episode breakdown card · Revenue share panel.

### Sidebar Structure
```
[VEXO Studio Logo]
[User Avatar + Name + Role]
─────────────────────────
🏠 Dashboard
👤 Users               >
🔑 Providers & Tokens
💰 Budgets & Tokens
🎬 TV Series           >
📋 Audit Logs
⚙️ Providers
🎥 TV Series           >
```

### Responsive
- <768px: sidebar collapses to 56px icon rail with hamburger overlay
- Cards stack to single column
- KPI cards horizontal snap-scroll
- Tables → card-list views

---

## Security

- Argon2 password hashing
- AES-256-GCM for provider API keys + OAuth tokens
- Row-level permission checks in every service method
- Signed S3 URLs (24h expiry) for asset access
- ADMIN-only access to finance internals
- Audit log on: user create/delete, role change, budget override, publish, provider key update

---

## Infra Files

- `docker-compose.yml` — postgres, redis, api, web, worker
- `.env.example` — all required env vars
- `prisma/seed.ts` — roles, permissions, super admin user
- `prisma/migrations/` — initial migrations
- `README.md` — setup, run, deploy

---

## Build Order (MVP Phases)

1. **Foundation** — Auth, Users, Roles, Permissions, Providers, Wallets, Cost Entries, Admin Dashboard
2. **Content Structure** — Projects, Project Settings, Series, Seasons, Episodes, Series Dashboard
3. **Production Layer** — Storyboard Frames, Asset System, Characters, Cost Estimation
4. **Media Generation** — Video Jobs, Music, Subtitles, Dubbing, Lip Sync
5. **Distribution & Revenue** — YouTube OAuth, Publishing Jobs, Analytics Sync, Revenue Engine
6. **AI Layer** — AI Director, AI Critic, Memory Engine, Recap Generator, Autopilot
7. **Extended Types** — Course Support, Kids Content, Advanced Dashboards, Revenue Splits

---

## Development Standards

1. `routes → middleware → controllers → services → repositories` — no skipping layers
2. Zod validation on all request bodies
3. Every Prisma migration named descriptively
4. Every provider call wrapped in try/catch with timeout + retry (3× exp backoff)
5. No blocking generation in request/response — always queue
6. Permissions middleware on every protected route
7. Every financial mutation → audit log
8. Every AI action → `ai_logs` entry
9. Soft delete (or `ARCHIVED`) — no hard deletes
10. Dashboards use dedicated aggregation endpoints, not raw tables
11. All uploads stored as `Asset` linked to parent entity
12. Job retry: 3 attempts, 5s/30s/120s
13. SSE endpoint for real-time job status: `GET /api/jobs/:id/stream`
14. State transitions validated in service layer before DB write
15. Feature flags via `ProjectSettings` — never hardcoded

---

## Default Super Admin
`admin@vexo.studio` / `Vexo@2025!`
