# Deploying VEXO Studio

## Railway (recommended — all-in-one with Postgres + Redis)

### One-time setup (5 min)

1. Create an account at https://railway.com
2. Generate an account token: https://railway.com/account/tokens → copy it
3. Paste the token to the agent (or run `railway login --browserless` locally)

### What the agent will provision

- **Postgres** (managed add-on) → provides `DATABASE_URL`
- **Redis** (managed add-on) → provides `REDIS_URL`
- **api** service (Dockerfile: `apps/api/Dockerfile`, config: `deploy/railway/api.json`)
  Runs `prisma migrate deploy` on each boot. Exposes public domain.
- **worker** service (Dockerfile: `apps/worker/Dockerfile`)
- **web** service (Dockerfile: `apps/web/Dockerfile`)
  `NEXT_PUBLIC_API_BASE_URL` → api public domain.

### Environment variables set automatically
- `DATABASE_URL` (from Postgres service)
- `REDIS_URL` (from Redis service)

### Environment variables to set manually (on each service)
- `ENCRYPTION_KEY` — 64-char hex (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — random strings
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_FULLNAME`
- (optional) provider keys: `FAL_API_KEY`, `ELEVENLABS_API_KEY`, `SUNO_API_KEY`, `OPENAI_API_KEY`, `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`

After first successful deploy, run the seed command once on the api service via Railway CLI:
```
railway run --service api "npx tsx packages/db/prisma/seed.ts"
```

## Alternative: Render

1. New → Blueprint → point at the repo
2. Render auto-detects `apps/*/Dockerfile`s — configure each as a Web Service / Background Worker
3. Add managed Postgres + Redis
4. Wire env vars as above

## Alternative: Fly.io

Each app (`apps/api`, `apps/worker`, `apps/web`) has a Dockerfile and can be deployed as a separate Fly app:
```
fly launch --dockerfile apps/api/Dockerfile --name vexo-api
fly launch --dockerfile apps/web/Dockerfile --name vexo-web
fly launch --dockerfile apps/worker/Dockerfile --name vexo-worker
fly postgres create vexo-db
fly redis create vexo-redis
```

## Docker on a VPS

Use the root `docker-compose.yml` — edit env vars and `docker compose up -d --build`.
