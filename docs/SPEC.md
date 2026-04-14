# VEXO STUDIO — Full Technical Specification (v2)

> Multi-tenant SaaS. Every resource belongs to `Organization`.

## Tech Stack

Backend: TypeScript / Fastify · Frontend: Next.js 14 App Router · ORM: Prisma · DB: PostgreSQL · Queue: BullMQ + Redis · Auth: JWT + Refresh + TOTP · Storage: S3 + CDN · Realtime: SSE · Validation: Zod · API: REST `/api/v1/` · Hashing: Argon2 + AES-256-GCM · Rate limiting: per-route.

## Layer Separation
`routes → middleware (auth + permissions + rate-limit + org-scope) → controllers → services → repositories → Prisma`

## Modules
```
apps/api · apps/web · apps/worker
packages/db · packages/queue · packages/shared
```

---

## Database Schema

Source of truth: [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma).

### Sections
1. **Organizations** — `Organization`, `OrganizationUser` · plan limits enforced in service layer
2. **Users & Auth** — `User`, `Role`, `Permission`, `RolePermission`, `UserSession`, `AuditLog`
3. **2FA / TOTP** — `TotpChallenge`
4. **API Keys** — `ApiKey` (SHA-256 hashed, prefix shown in UI, scope JSON)
5. **Webhook Endpoints** — `WebhookEndpoint`, `WebhookDelivery` (HMAC-SHA256)
6. **In-App Notifications** — `NotificationEvent`
7. **Providers & Wallets** — `Provider` (org-scoped), `CreditWallet`, `CreditTransaction`, `AlertRule`, `AlertEvent`
8. **Incoming Webhooks** — `IncomingWebhook` (provider callbacks, HMAC verified)
9. **Projects** — `Project` (org-scoped), `ProjectSettings` (with new feature flags)
10. **Series / Seasons / Episodes** — with SEO fields, scheduledPublishAt, previewVideoUrl
11. **Content Calendar** — `ContentCalendarEntry`
12. **Thumbnail A/B** — `ThumbnailVariant`
13. **Course** — `Course`, `CourseModule`, `Lesson`
14. **Scenes / Frames / Assets** — `Scene` (with styleConstraints, dialogueJson), `SceneFrame`, `Asset` (CDN URL), `SceneVersion`
15. **Collaboration** — `SceneComment`, `TaskAssignment`
16. **Templates** — `ProjectTemplate` (marketplace, public/premium)
17. **Characters & Voices** — `Character` (with visualFingerprint), `CharacterMedia`, `CharacterVoice`
18. **Music / Subtitles / Dubbing / Lip Sync**
19. **AI Director / Critic / Memory / Style Engine** — `AIDirector`, `AILog`, `AICriticReview`, `ProjectMemory`, `StyleConsistencySnapshot`, `RecapCandidate`, `ScriptBreakdown`
20. **Distribution / Analytics / Finance** — `ChannelIntegration` (org-scoped), `ProjectDistribution`, `PublishingJob`, `AnalyticsSnapshot` (with dropOffPoints, sentimentScore), `AudienceInsight`, `CostEntry`, `RevenueEntry`, `RevenueStream`, `RevenueSplit`

### Enums
`ContentType` (SERIES, COURSE, KIDS_CONTENT) · `ProjectStatus` (DRAFT, ACTIVE, PAUSED, ARCHIVED) · `AIMode` (MANUAL, ASSISTED, AUTOPILOT) · `EpisodeStatus` (DRAFT, PLANNING, IN_PRODUCTION, REVIEW, READY_FOR_PUBLISH, PUBLISHED, ARCHIVED) · `SceneStatus` (DRAFT, PLANNING, STORYBOARD_GENERATING, STORYBOARD_REVIEW, STORYBOARD_APPROVED, VIDEO_GENERATING, VIDEO_REVIEW, APPROVED, LOCKED) · `OrgPlan` (FREE, PRO, STUDIO, ENTERPRISE)

---

## Roles & Permissions

Roles (per org): `SUPER_ADMIN`, `ADMIN`, `DIRECTOR`, `CONTENT_EDITOR`, `AI_OPERATOR`, `FINANCE_VIEWER`, `VIEWER`

Permissions:
```
manage_users, manage_roles, manage_providers, manage_tokens,
view_finance, manage_finance, create_project, edit_project,
delete_project, manage_distribution, generate_assets,
approve_scene, publish_episode, manage_ai_director,
view_logs, manage_music, manage_subtitles, manage_dubbing,
manage_api_keys, manage_webhooks, manage_organization,
manage_templates, manage_calendar, view_audience_insights
```

---

## API Endpoints (`/api/v1/`)

### System
```
GET /health · GET /ready
```

### Auth
```
POST /auth/login · /auth/logout · /auth/refresh · /auth/forgot-password · /auth/reset-password
GET  /auth/me
POST /auth/2fa/setup · /auth/2fa/verify · /auth/2fa/disable · /auth/2fa/challenge
GET  /auth/sessions · DELETE /auth/sessions/:id
```

### Organizations
```
GET   /organizations/me · PATCH /organizations/me
GET   /organizations/me/members · POST /organizations/me/invite
DELETE /organizations/me/members/:userId
```

### API Keys
```
GET /api-keys · POST /api-keys · DELETE /api-keys/:id
```

### Webhooks (outbound)
```
GET /webhooks/endpoints · POST /webhooks/endpoints · DELETE /webhooks/endpoints/:id
GET /webhooks/endpoints/:id/deliveries
```

### Webhooks (incoming, provider callbacks)
```
POST /webhooks/incoming/:providerId    (HMAC verified)
```

### Notifications
```
GET /notifications · PATCH /notifications/read-all · PATCH /notifications/:id/read
GET /notifications/stream    (SSE)
```

### Users / Roles / Providers / Wallets
Standard CRUD per spec. Plus `POST /providers/:id/test`.

### Projects
```
GET/POST /projects · GET/PATCH/DELETE /projects/:id
GET/PATCH /projects/:id/settings
GET/PATCH /projects/:id/style-guide
```

### Templates
```
GET/POST /templates · GET/PATCH/DELETE /templates/:id
POST /templates/:id/apply
```

### Calendar
```
GET/POST /projects/:id/calendar
PATCH/DELETE /calendar/:id
```

### Series / Seasons / Episodes
Standard nested CRUD + `POST /episodes/:id/export · /publish`, `GET /episodes/:id/preview`.

### Episode SEO
```
POST /episodes/:id/seo/generate · GET/PATCH /episodes/:id/seo
```

### Thumbnail A/B
```
GET/POST /episodes/:id/thumbnails
POST /thumbnails/:id/activate · /thumbnails/:id/winner
```

### Scenes & Frames
Standard CRUD + `POST /scenes/:id/approve · /generate-storyboard · /generate-video · /breakdown`, `POST /frames/:id/regenerate`.

### Collaboration
```
GET/POST /scenes/:id/comments · PATCH/DELETE /comments/:id · POST /comments/:id/resolve
GET/POST /scenes/:id/tasks · PATCH /tasks/:id
```

### Characters / Media Generation / AI Director / Critic / Style / Memory / Distribution / Analytics / Audience / Finance
See full route list in v2 master doc.

---

## Rate Limiting

| Endpoint Group | Limit |
|---|---|
| `POST /auth/login` | 10 / 15 min / IP |
| `POST /auth/*` | 20 / hour / IP |
| `POST /*/generate-*` | 30 / min / org |
| `POST /*/publish` | 10 / min / org |
| `GET /*` general | 300 / min / org |
| External API Keys | 60 / min / key |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.

---

## BullMQ Queues

Retry: 3 attempts, exp backoff 5s / 30s / 120s.

| Queue | Priority |
|---|---|
| `publishing` | 1 |
| `lip-sync-generation`, `incoming-webhook` | 2 |
| `video-generation`, `webhook-delivery` | 3 |
| `storyboard-generation`, `dubbing-generation` | 4 |
| `music-generation`, `subtitle-generation`, `avatar-generation`, `dialogue-generation` | 5 |
| `critic-review`, `seo-generation` | 6 |
| `style-snapshot`, `script-breakdown` | 7 |
| `analytics-sync`, `audience-insights` | 8 |
| `memory-refresh`, `recap-generation` | 9 |

### Base Job
```ts
interface BaseJob {
  jobId: string;
  jobType: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  providerId?: string;
  payload: Record<string, unknown>;
  priority?: number;
  estimatedCost?: number;
  actualCost?: number;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  startedAt?: Date;
  completedAt?: Date;
  failedReason?: string;
}
```

On completion/failure → fire `NotificationEvent` + deliver to registered `WebhookEndpoint`.

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
  handleWebhook?(payload: unknown, signature: string): Promise<void>;
}
```

Stubs: `fal`, `elevenlabs`, `suno`, `openai-tts`, `youtube`, `runwayml`.

---

## Services

`CostStrategyService`, `RevenueEngine`, `MemoryEngine`, `StyleConsistencyEngine`, `AIDirectorService`, `AICriticService`, `SEOOptimizerService`, `ScriptBreakdownService`, `DialogueGeneratorService`, `AudienceInsightService`, `NotificationService` (with SSE), `WebhookService` (deliver + verify incoming).

---

## Workflow Rules

### Scene Flow
1. Created → `DRAFT`
2. `generate-storyboard` → `STORYBOARD_GENERATING` (StyleConsistencyEngine injects constraints)
3. Done → `STORYBOARD_REVIEW`
4. Approve frames → `STORYBOARD_APPROVED` (frames feed StyleConsistencyEngine snapshot)
5. `generate-video` → `VIDEO_GENERATING`
6. Done → `VIDEO_REVIEW`
7. Approve → `APPROVED` → optionally `LOCKED`

### Budget Rules
- Every generation job runs `canAffordOperation()` first
- `budget_status = CRITICAL` → block, return 402
- Only `ADMIN` can override

### Autopilot Rules
- All actions logged to `ai_logs`
- Cannot publish without valid `ProjectDistribution`
- Cannot exceed user permission scope
- Stoppable per-project via `autopilotEnabled = false`
- SEO runs auto before publish if `seoOptimizerEnabled = true`

### 2FA Rules
- SUPER_ADMIN + ADMIN: 2FA enforced
- Other roles: optional
- Login with 2FA on → returns `{ requiresTotpChallenge: true }`, client follows up with `/auth/2fa/challenge`

### Plan Limits
| Plan | maxProjects | maxEpisodes | Autopilot | White-label |
|---|---|---|---|---|
| FREE | 1 | 3 | × | × |
| PRO | 5 | ∞ | ✓ | × |
| STUDIO | ∞ | ∞ | ✓ | × |
| ENTERPRISE | ∞ | ∞ | ✓ | ✓ |

---

## Frontend Screens

`/login` (with TOTP step), `/onboarding`, `/admin`, `/admin/users`, `/admin/roles`, `/admin/providers`, `/admin/api-keys`, `/admin/webhooks`, `/admin/notifications`, `/admin/logs`, `/projects`, `/projects/new`, `/templates`, `/projects/[id]`, `/projects/[id]/calendar`, `/projects/[id]/series/[seriesId]`, `/projects/[id]/series/[seriesId]/seasons/[seasonId]`, `/episodes/[id]`, `/episodes/[id]/seo`, `/episodes/[id]/thumbnails`, `/scenes/[id]`, `/characters/[projectId]`, `/projects/[id]/finance`, `/projects/[id]/distribution`, `/projects/[id]/analytics`, `/projects/[id]/ai-director`, `/account/sessions`, `/account/2fa`.

UI requirements: empty states, skeleton loaders, inline error states, onboarding tour (driver.js).

---

## Design System

### Branding
- Name: VEXO Studio
- Logo: "VEXO" navy-to-blue gradient, "STUDIO" cyan, metallic camera lens replaces "O", cyan orbital film-strip ring
- Logo top-left of sidebar, always visible

### Layout
- Sidebar 260px, `radial-gradient(ellipse at top, #1a2d4a 0%, #0d1b2e 70%)`
- Topbar 64px white, page title + search + notification bell (unread count) + avatar
- Main `#f0f4f9`, scrollable, 24px pad
- Cards `border-radius: 12px`, `box-shadow: 0 2px 12px rgba(0,0,0,0.06)`

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
  --border-card: #e2e8f2;
  --text-primary: #1a2540;
  --text-secondary: #556280;
  --text-muted: #9aaabf;

  --accent-primary: #0091d4;
  --accent-primary-light: #00b4e8;
  --accent-cyan: #00c8f0;

  --status-normal-bg: #e6f9f0; --status-normal-text: #1db868;
  --status-error-bg: #ffeef0;  --status-error-text: #e03a4e;
  --status-warning-bg: #fff8e6; --status-warning-text: #f0a500;

  --chart-bar-budgeted: #1a6fba; --chart-bar-actual: #4bb8e8;
  --chart-line-revenue: #00c896;

  --kpi-cost: #e03a4e; --kpi-revenue: #1db868; --kpi-profit: #0091d4; --kpi-views: #1a2540;
}
```

### Typography
- Outfit (UI) + Inter (numbers, tabular-nums)
- Logo: SVG/image
- Headings: Outfit 600–700 · Body: Outfit 400 · Sidebar: Outfit 500 14px · Numbers: Inter 700
- Table headers: uppercase, 11px, letter-spacing 0.08em, `--text-muted`

### Component Patterns
Sidebar nav · KPI cards · status badge (normal/error/warning) · provider/series row · cost+revenue chart (bars + line) · **notification bell with SSE-driven badge** · **session management table** · series hero header · **content calendar (month/week, drag-drop)** · episode breakdown card · **A/B thumbnail panel** · revenue share panel.

### Sidebar Structure
```
[Logo] [User]
─────────────
🏠 Dashboard
👤 Users >
🔑 Providers & Tokens
💰 Budgets & Tokens
🎬 TV Series >
📅 Content Calendar
🧩 Templates
🔔 Notifications
📋 Audit Logs
🔗 API Keys & Webhooks
⚙️ Settings
```

### Responsive
- <768px: sidebar → 56px icon rail + hamburger
- Cards stack
- KPI cards horizontal snap-scroll
- Tables → card lists
- Touch targets ≥44px

---

## Security

- Argon2 passwords · AES-256-GCM for provider keys, OAuth tokens, TOTP secrets
- Row-level `organizationId` checks on every service call — never trust client-provided org id
- Signed CDN URLs (24h) — never expose raw S3
- 2FA enforced for SUPER_ADMIN + ADMIN
- Audit log on user/role/budget/publish/key/session changes
- HMAC-SHA256 verification on every incoming provider webhook
- API key auth: SHA-256 hash compare, never store plaintext
- Rate limiting on auth + generation
- CSRF on state-changing routes · CSP headers on web
- No hard deletes on financial records

---

## Infra Files

`docker-compose.yml` (postgres + redis + api + web + worker + nginx/caddy) · `.env.example` (commented) · `prisma/seed.ts` (roles, perms, default org, super admin) · `prisma/migrations/` · `README.md` · `scripts/health-check.sh`

---

## Build Phases

1. Foundation — Orgs, Auth+2FA, Users, Roles, Sessions, Audit, Health, Admin
2. Providers & Finance — Providers, Wallets, Transactions, Alerts, Notifications
3. Content Structure — Projects (org-scoped), Settings, Series, Seasons, Episodes
4. Production — Scenes, Frames, Assets, Characters, Cost Estimation, Style Engine basic
5. Media Generation — Video, Music, Subtitles, Dubbing, Lip Sync, Dialogue
6. Distribution — YouTube OAuth, Publishing, SEO, A/B Thumbnails, Analytics, Calendar
7. AI Layer — Director, Critic, Memory, Script Breakdown, Recap, Autopilot, Audience Insights
8. Collaboration & Platform — Comments, Tasks, Templates/Marketplace, API Keys, Webhooks, White-label
9. Extended & Polish — Course, Kids, Onboarding tour, empty states, mobile

---

## Development Standards

1. `routes → middleware → controllers → services → repositories` — no skipping
2. All endpoints under `/api/v1/`
3. Zod validation on all bodies
4. Every Prisma query filtered by `organizationId` — never cross-org
5. Migrations named descriptively
6. Provider calls: try/catch + 30s timeout + 3× exp backoff
7. No blocking generation in request cycle — always queue
8. Permissions middleware on every protected route
9. Financial mutations → audit log
10. AI actions → `ai_logs`
11. Soft delete or `ARCHIVED` only — no hard deletes
12. Dashboards via dedicated aggregation endpoints
13. Uploads → `Asset` records with CDN URL
14. Job retry: 3 attempts, 5s/30s/120s
15. SSE for job status: `GET /api/v1/jobs/:id/stream`
16. State transitions validated in service layer
17. Feature flags via `ProjectSettings`
18. Rate-limit headers on limited routes
19. `@@index` on all FK WHERE columns
20. HMAC verification on every incoming provider webhook
21. NotificationService on every job done/failed
22. WebhookService.deliver on publishable events
23. Plan limits enforced in service layer
24. 2FA enforced in middleware for ADMIN/SUPER_ADMIN

## Defaults
- Super Admin: `admin@vexo.studio` / `Vexo@2025!`
- Default org slug: `vexo-default`
- 2FA setup forced on first SUPER_ADMIN login
