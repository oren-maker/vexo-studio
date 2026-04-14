# VEXO Studio

AI-powered video production SaaS — TV series, training courses, kids' content. **Multi-tenant** (Organizations).

Full spec: [docs/SPEC.md](docs/SPEC.md). Master instructions: [CLAUDE.md](CLAUDE.md).

## Monorepo

```
apps/api      Fastify REST API at /api/v1 (JWT, 2FA TOTP, Argon2, rate limiting)
apps/web      Next.js 14 frontend (App Router, Tailwind, design tokens)
apps/worker   BullMQ worker — 19 queues with priority, notifications on done/fail
packages/db   Prisma schema (40+ models, multi-tenant) + seed
packages/queue BullMQ registry + priorities + base job type
packages/shared Zod schemas, constants, plan limits, queue names
```

## Quick Start

```bash
npm install
cp .env.example .env
#   set ENCRYPTION_KEY (64 hex chars), JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run db:seed

npm run dev
```

Default super admin: `admin@vexo.studio` / `Vexo@2025!` · Default org slug: `vexo-default` · 2FA setup forced on first SUPER_ADMIN login.

## Services

| Service | Port |
|---|---|
| web | 3000 |
| api | 4000 |
| postgres | 5432 |
| redis | 6379 |

## Production (Docker)
```bash
docker compose up -d --build
```

## Phase Status (per CLAUDE.md)

- ✓ **Phase 1** Foundation — Orgs, Auth+2FA, Users, Roles, Sessions, Audit, Health
- ✓ **Phase 2** Providers & Finance — Providers, Wallets, Transactions, Notifications
- ✓ **Phase 3** Content — Projects, Settings, Series, Seasons, Episodes (with SEO + scheduledPublishAt)
- ✓ **Phase 4** Production — Scenes, Frames, Assets, Characters, Cost Estimation, Style Engine
- ✓ **Phase 5** Media Generation — Video, Music, Subtitles, Dubbing, Lip Sync, Dialogue (queued)
- ✓ **Phase 6** Distribution — YouTube channels, Publishing, SEO Optimizer, A/B Thumbnails, Calendar, Analytics
- ✓ **Phase 7** AI Layer — Director, Critic, Memory, Script Breakdown, Recap, Audience Insights
- ✓ **Phase 8** Collaboration & Platform — Comments, Tasks, Templates, API Keys, Webhooks
- ✓ **Phase 9** Extended Types — Course/Module/Lesson, page shell components

> AI generation jobs are queued and routed to provider adapters. Provider adapter implementations are stubs — wire real APIs (fal/elevenlabs/suno/openai-tts/youtube/runwayml) to ship to production.
