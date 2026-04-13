FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/web/package.json apps/web/

RUN npm install --workspaces --include-workspace-root

COPY apps/web ./apps/web

WORKDIR /app/apps/web
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
