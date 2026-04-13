FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspaces --include-workspace-root

COPY packages ./packages
COPY apps/worker ./apps/worker

RUN npm --workspace @vexo/db run generate
RUN npm --workspace @vexo/worker run build

CMD ["node", "apps/worker/dist/index.js"]
