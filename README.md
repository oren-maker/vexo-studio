# VEXO Studio

AI-powered video production SaaS — TV series, training courses, and kids' content.

Full spec: [docs/SPEC.md](docs/SPEC.md). Master instructions: [CLAUDE.md](CLAUDE.md).

## Monorepo Layout

```
apps/
  api/        Fastify backend (REST, JWT, Argon2)
  web/        Next.js 14 frontend (App Router)
  worker/     BullMQ worker
packages/
  db/         Prisma schema + client + seed
  queue/      BullMQ queue registry
  shared/     Zod schemas, constants, types
```

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
#   then set ENCRYPTION_KEY (64 hex chars) and JWT secrets

# 3. Start Postgres + Redis
docker compose up -d postgres redis

# 4. Generate Prisma client + migrate + seed
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Run all services in dev
npm run dev
```

Default super admin (from `.env`): `admin@vexo.studio` / `Vexo@2025!`

## Services

| Service | Port | URL |
|---|---|---|
| web    | 3000 | http://localhost:3000 |
| api    | 4000 | http://localhost:4000/health |
| postgres | 5432 | — |
| redis | 6379 | — |

## Production (Docker)

```bash
docker compose up -d --build
```

## Build Phases

See [CLAUDE.md](CLAUDE.md) — currently scaffolded: **Phase 1 foundation** (auth, users, roles, providers, wallets, admin shell).
