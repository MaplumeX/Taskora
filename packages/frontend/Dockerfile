# ── Stage 1: build ─────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/

RUN pnpm install --frozen-lockfile --filter @taskora/frontend --filter @taskora/shared

COPY packages/shared packages/shared
RUN pnpm --filter @taskora/shared build

COPY packages/frontend packages/frontend
RUN VITE_API_URL=/api/v1 pnpm --filter @taskora/frontend build

# ── Stage 2: runtime ──────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
