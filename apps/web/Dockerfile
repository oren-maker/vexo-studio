FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/web/package.json apps/web/

RUN npm install --workspaces --include-workspace-root

COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
