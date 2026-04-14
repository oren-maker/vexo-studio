# VEXO STUDIO — Claude Code Master Instructions (v2)

## Overview

Build **VEXO Studio** — a full-stack AI-powered video production SaaS platform. **Multi-tenant**: every resource belongs to an `Organization`. Users join organizations with org-scoped roles.

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | TypeScript (Fastify) |
| Frontend | Next.js 14 (App Router) |
| ORM | Prisma + PostgreSQL |
| Queue | BullMQ + Redis |
| Auth | JWT + Refresh + TOTP (2FA) |
| Storage | S3-compatible behind CDN |
| Realtime | SSE for jobs + notifications |
| Validation | Zod |
| API | REST under `/api/v1/` |
| Hashing | Argon2 (passwords), AES-256-GCM (provider keys, OAuth, TOTP secrets) |
| Rate Limiting | per-route per-IP/org |

## Architecture

`routes → middleware (auth + permissions + rate-limit + org-scope) → controllers → services → repositories → Prisma`

```
/apps
  /api    Fastify backend
  /web    Next.js frontend
  /worker BullMQ worker
/packages
  /db     Prisma schema + migrations + seed
  /queue  BullMQ registry
  /shared Zod schemas + constants + types
```

## Build Phases

1. **Foundation** — Organizations, Auth (+2FA), Users, Roles, Permissions, Sessions, Audit, Health, Admin
2. **Providers & Finance** — Providers, Wallets, Transactions, Alerts, Notifications
3. **Content Structure** — Projects (org-scoped), Settings, Series, Seasons, Episodes
4. **Production** — Scenes, Frames, Assets, Characters, Cost Estimation, Style Engine
5. **Media Generation** — Video, Music, Subtitles, Dubbing, Lip Sync, Dialogue
6. **Distribution** — YouTube OAuth, Publishing, SEO Optimizer, A/B Thumbnails, Analytics, Calendar
7. **AI Layer** — Director, Critic, Memory, Script Breakdown, Recap, Autopilot, Audience Insights
8. **Collaboration & Platform** — Comments, Tasks, Templates/Marketplace, API Keys, Webhooks, White-label
9. **Extended & Polish** — Course, Kids, Onboarding tour, empty states, mobile

> **Full spec** lives in [docs/SPEC.md](docs/SPEC.md) — schema, endpoints, queues, services, screens, design system, security, dev standards.

## Defaults
- Super Admin: `admin@vexo.studio` / `Vexo@2025!`
- Default org slug: `vexo-default`
- 2FA enforced for SUPER_ADMIN + ADMIN

## Owner
אורן — oren@bin.co.il | GitHub: oren-maker
