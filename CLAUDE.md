# VEXO STUDIO — Claude Code Master Instructions

## Overview

Build **VEXO Studio** — a full-stack AI-powered video production SaaS platform that enables creation, management, production, distribution, and measurement of structured video content (TV series, training courses, kids' content). The system manages the entire production pipeline from initial concept to published episode, integrating AI generation, cost control, and analytics.

---

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

---

## Architecture

### Layer Separation (strictly enforce)
```
routes → middleware (auth + permissions) → controllers → services → repositories → Prisma
```

### Module Structure
```
/apps
  /api          — Express/Fastify backend
  /web          — Next.js frontend
  /worker       — BullMQ worker process
/packages
  /db           — Prisma schema + migrations
  /queue        — BullMQ workers + job definitions
  /shared       — Zod schemas, types, constants
```

---

## Build Order (MVP Phases)

1. **Foundation** — Auth, Users, Roles, Permissions, Providers, Wallets, Cost Entries, Admin Dashboard
2. **Content Structure** — Projects, Project Settings, Series, Seasons, Episodes, Series Dashboard
3. **Production Layer** — Storyboard Frames, Asset System, Characters, Cost Estimation
4. **Media Generation** — Video Jobs, Music, Subtitles, Dubbing, Lip Sync
5. **Distribution & Revenue** — YouTube OAuth, Publishing Jobs, Analytics Sync, Revenue Engine
6. **AI Layer** — AI Director, AI Critic, Memory Engine, Recap Generator, Autopilot
7. **Extended Types** — Course Support, Kids Content, Advanced Dashboards, Revenue Splits

> **Full spec** lives in [docs/SPEC.md](docs/SPEC.md) — schema, endpoints, queues, services, screens, design system, security, dev standards.

---

## Default Super Admin
`admin@vexo.studio` / `Vexo@2025!`

## Owner
אורן — oren@bin.co.il | GitHub: oren-maker
