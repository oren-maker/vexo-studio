# VEXO Studio

AI-powered video production SaaS — TV series, training courses, kids' content. **Multi-tenant** (Organizations).

Full spec: [docs/SPEC.md](docs/SPEC.md). Master instructions: [CLAUDE.md](CLAUDE.md).

## Monorepo

```
apps/api      Fastify backend (REST /api/v1, JWT, 2FA TOTP, Argon2)
apps/web      Next.js 14 frontend (App Router)
apps/worker   BullMQ worker (19 queues)
packages/db   Prisma schema + client + seed (multi-tenant)
packages/queue BullMQ registry + priorities
packages/shared Zod schemas, constants, types
```

## Quick Start

```bash
npm install
cp .env.example .env
#   set ENCRYPTION_KEY (64 hex chars), JWT secrets

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

## Phase Status
**Phase 1 — Foundation:** ✓ done. See [CLAUDE.md](CLAUDE.md) for the full 9-phase plan.
