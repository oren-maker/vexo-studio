FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++ openssl

# Workspace manifests
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspaces --include-workspace-root

# Source
COPY packages ./packages
COPY apps/api ./apps/api

# Generate prisma client + build workspace packages + api
RUN npx --yes prisma generate --schema=packages/db/prisma/schema.prisma && \
    npm --workspace @vexo/shared run build && \
    npm --workspace @vexo/queue run build && \
    npm --workspace @vexo/db run build && \
    npm --workspace @vexo/api run build

ENV NODE_ENV=production
EXPOSE 4000

# Apply migrations on startup, then run the API server.
CMD sh -c "npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma && node apps/api/dist/server.js"
