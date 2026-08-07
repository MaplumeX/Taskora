# Taskora

[English](README.md) · [简体中文](README.zh-CN.md)

A Things-inspired task manager built as a pnpm monorepo. NestJS API + Prisma/PostgreSQL on the backend, Vite + React + Tailwind on the frontend, with a shared DTO package and Docker-based deployment.

## Features

- **Areas → Projects → Tasks → Subtasks** hierarchy for organizing work.
- **Buckets**: Inbox, Anytime, Scheduled, Someday, Today, Upcoming, Logbook, Trash.
- **Project headings** to group tasks within a project.
- **Tags & tag groups** with color and sort order, attachable to tasks, projects, and areas.
- **Soft-delete (Trash)** with restore and cascade cleanup.
- **JWT auth** with access tokens and rotating refresh tokens (bcrypt password hashing).
- **i18n** with English and 简体中文 locales.
- **Drag-and-drop** reordering via dnd-kit.

## Tech Stack

| Layer | Stack |
| --- | --- |
| Backend | NestJS 11, Prisma 6, PostgreSQL 17, Passport-JWT, bcryptjs |
| Frontend | Vite 5, React 18, TailwindCSS 3, TanStack Query, Zustand, react-router, dnd-kit, i18next |
| Shared | TypeScript DTOs and enums (`workspace:*`, not published to npm) |
| Tooling | pnpm 9, Node 22, ESLint, Prettier, Vitest |
| Deploy | Docker (dual images), GitHub Actions CI/CD, GHCR |

## Project Structure

```
packages/
├── backend/       # NestJS API (Prisma schema, migrations, modules)
├── frontend/      # Vite + React SPA
└── shared/        # Cross-package DTOs / enums / types
```

Backend modules: `auth`, `users`, `areas`, `projects`, `tasks`, `subtasks`, `tags`, `tag-groups`, `project-headings`, `feed`. All API routes are prefixed with `/api/v1`.

## Prerequisites

- Node.js 22
- pnpm 9 (enable via `corepack enable`)
- PostgreSQL 17 (or use the provided `docker-compose.yml`)

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Backend — `packages/backend/.env`:

```env
DATABASE_URL=postgresql://taskora:taskora@localhost:5432/taskora?schema=public
JWT_SECRET=your-secret-here
```

Frontend — `packages/frontend/.env`:

```env
VITE_API_URL=http://localhost:3000/api/v1
```

### 3. Set up the database

Start PostgreSQL (the compose file includes it, or run your own):

```bash
docker compose up -d postgres
```

Then run migrations and generate the Prisma client:

```bash
pnpm --filter @taskora/backend exec prisma migrate dev
pnpm --filter @taskora/backend exec prisma generate
```

Optional seed data:

```bash
pnpm --filter @taskora/backend exec prisma db seed
# demo login: test@example.com / password123
```

### 4. Run the dev servers

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000/api/v1

## Scripts

Run from the repo root:

| Command | Description |
| --- | --- |
| `pnpm dev` | Start all packages in parallel (watch mode) |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run tests across all packages |
| `pnpm lint` | Lint the repo |
| `pnpm format` | Format with Prettier |

Backend-specific (run with `pnpm --filter @taskora/backend exec ...`):

- `prisma migrate dev` — create/apply migrations
- `prisma generate` — regenerate the Prisma client
- `prisma db seed` — load seed data

## Docker Deployment

A `docker-compose.yml` is provided for local full-stack runs:

```bash
docker compose up -d
```

This starts:

- `postgres` on port 5432
- `backend` on port 3000 (auto-runs `prisma migrate deploy` on boot)
- `frontend` on port 8080 (nginx serves the SPA and reverse-proxies `/api` to the backend)

### Building images manually

```bash
docker build -f packages/backend/Dockerfile  -t taskora-backend  .
docker build -f packages/frontend/Dockerfile -t taskora-frontend .
```

## CI/CD

GitHub Actions workflows live in `.github/workflows/`:

- **CI** (`ci.yml`) — on every PR and `main` push: install, typecheck, test, and verify both Docker images build.
- **Release** (`release.yml`) — on git tags matching `v*`: builds and pushes images to GHCR.
  - `ghcr.io/maplumex/taskora-backend:vX.Y.Z` / `:latest`
  - `ghcr.io/maplumex/taskora-frontend:vX.Y.Z` / `:latest`

See [docs/versioning-and-deployment.md](docs/versioning-and-deployment.md) for the full versioning, branching, and multi-client rollout strategy.

## License

Private project. All rights reserved.