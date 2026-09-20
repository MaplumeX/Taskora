# ── Stage 1: build ─────────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/api/package.json packages/api/
COPY packages/ui/package.json packages/ui/
COPY packages/frontend/package.json packages/frontend/

RUN pnpm install --frozen-lockfile --filter @taskora/frontend --filter @taskora/shared --filter @taskora/engine --filter @taskora/api --filter @taskora/ui

COPY packages/shared packages/shared
RUN pnpm --filter @taskora/shared build

COPY packages/engine packages/engine
RUN pnpm --filter @taskora/engine build

COPY packages/api packages/api
COPY packages/ui packages/ui
COPY packages/frontend packages/frontend
ARG VITE_API_URL=/api/v1
RUN VITE_API_URL="${VITE_API_URL}" pnpm --filter @taskora/frontend build

# ── Stage 2: runtime ──────────────────────────────────────────
FROM nginx:alpine AS runtime

ARG VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="taskora-frontend"
LABEL org.opencontainers.image.source="https://github.com/MaplumeX/Taskora"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
