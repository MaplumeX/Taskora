# ── Stage 1: base (install deps) ──────────────────────────────
FROM node:22-alpine AS base

RUN corepack enable

WORKDIR /app

# Copy workspace config + lockfile for deterministic install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

RUN pnpm install --frozen-lockfile --filter @taskora/backend --filter @taskora/shared

# ── Stage 2: build ─────────────────────────────────────────────
FROM base AS build

COPY packages/shared packages/shared
RUN pnpm --filter @taskora/shared build

COPY packages/backend packages/backend
RUN pnpm --filter @taskora/backend exec prisma generate
RUN pnpm --filter @taskora/backend build

# ── Stage 3: runtime ──────────────────────────────────────────
FROM node:22-alpine AS runtime

ARG VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="taskora-backend"
LABEL org.opencontainers.image.source="https://github.com/MaplumeX/Taskora"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"

RUN corepack enable

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma

WORKDIR /app/packages/backend

EXPOSE 3000

CMD ["node", "dist/main.js"]
