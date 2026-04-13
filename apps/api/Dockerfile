FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspaces --include-workspace-root

COPY packages ./packages
COPY apps/api ./apps/api

RUN npm --workspace @vexo/db run generate
RUN npm --workspace @vexo/api run build

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
