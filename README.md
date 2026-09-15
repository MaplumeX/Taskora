# Taskora

[English](README.md) · [简体中文](README.zh-CN.md)

A Things-inspired task manager built as a pnpm monorepo. NestJS API + Prisma/PostgreSQL on the backend, Vite + React + Tailwind on the frontend, with a shared DTO package and Docker-based deployment. A Tauri 2 desktop client shares the web app's views and data layer.

## Features

- **Areas → Projects → Tasks → Subtasks** hierarchy for organizing work.
- **Buckets**: Inbox, Anytime, Scheduled, Someday, Today, Upcoming, Logbook, Trash.
- **Project headings** to group tasks within a project.
- **Tags & tag groups** with color and sort order, attachable to tasks, projects, and areas.
- **Soft-delete (Trash)** with restore and cascade cleanup.
- **JWT auth** with access tokens and rotating refresh tokens (bcrypt password hashing).
- **i18n** with English and 简体中文 locales.
- **Drag-and-drop** reordering via dnd-kit.
- **Desktop client** (Tauri 2): full feature parity with the web app, OS-keychain token storage, global-shortcut quick add (Ctrl/Cmd+Space).

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
├── frontend/      # Vite + React SPA (shell: router, entry, auth pages)
├── desktop/       # Tauri 2 desktop client (shell, quick add, keyring auth)
├── ui/            # Cross-client business components & page views
├── api/           # Cross-client API client, query hooks, auth, i18n
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

When using Docker Compose, Compose reads `.env` from the repository root. Create it from the template; do not reuse the backend `.env` directly because the database hostname inside Docker is `postgres`, not `localhost`:

```bash
cp .env.example .env
```

Before starting the shared environment, update `POSTGRES_PASSWORD` and `JWT_SECRET` in `.env`.

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

## Desktop Client

Prebuilt desktop installers are published on the [GitHub Releases page](https://github.com/maplumex/taskora/releases) under tags matching `desktop-v*`:

| Platform | Artifact |
| --- | --- |
| macOS (Apple Silicon & Intel) | `Taskora_x.y.z_aarch64.dmg` / `_x64.dmg` |
| Windows | `Taskora_x.y.z_x64-setup.exe` (NSIS) |
| Linux | `Taskora_x.y.z_amd64.AppImage` |

On first launch you configure the address of your self-hosted server (the API base URL, e.g. `https://taskora.example.com/api/v1`) and sign in with your account. Windows stores the access and refresh tokens together in a per-user DPAPI-encrypted file (normally `%LOCALAPPDATA%\app.taskora.desktop\session.dpapi`); macOS / Linux use the OS keychain. Tokens never reach plaintext files or browser storage. Legacy credentials are migrated automatically.

### Unsigned builds — how to bypass the warnings

V1 builds are **not code-signed**, so both platforms will warn on first launch:

- **macOS Gatekeeper**: right-click the app → *Open* → *Open* in the dialog (or System Settings → Privacy & Security → *Open Anyway*). This is only needed once.
- **Windows SmartScreen**: click *More info* → *Run anyway*.
- **Linux**: AppImages are not affected; make the file executable (`chmod +x`) and run it.

Code signing and auto-update will be added once there are real users; until then, download new versions manually from Releases.

### Building from source

```bash
# Linux: install webkit2gtk and friends first, see
# https://tauri.app/start/prerequisites/
pnpm --filter @taskora/desktop dev    # dev window
pnpm --filter @taskora/desktop build  # installers for your platform
```

## Docker Deployment

A `docker-compose.yml` is provided for local full-stack runs:

```bash
test -f .env || cp .env.example .env  # Create once, then update the secrets
docker compose up -d --build
```

This starts:

- `postgres` on port 5432
- `backend` on port 3000 (auto-runs `prisma migrate deploy` on boot)
- `frontend` on port 7646 (nginx serves the SPA and reverse-proxies `/api` to the backend)

Compose waits for PostgreSQL's health check before starting the backend. If `VITE_API_URL` changes, rebuild the frontend image with `--build` because Vite embeds this value at build time.

### Building images manually

```bash
docker build -f packages/backend/Dockerfile  -t taskora-backend  .
docker build -f packages/frontend/Dockerfile -t taskora-frontend .
```

## CI/CD

GitHub Actions workflows live in `.github/workflows/`:

- **CI** (`ci.yml`) — on every PR and `main` push: install, typecheck, test, desktop Rust check (Linux only), and verify both Docker images build.
- **Release** (`release.yml`) — on git tags matching `v*`: builds and pushes images to GHCR.
  - `ghcr.io/maplumex/taskora-backend:vX.Y.Z` / `:latest`
  - `ghcr.io/maplumex/taskora-frontend:vX.Y.Z` / `:latest`
- **Desktop Release** (`desktop-release.yml`) — on git tags matching `desktop-v*`: builds the three-platform desktop installers (dmg / NSIS exe / AppImage) and uploads them to a GitHub Release. V1 builds are unsigned and have no auto-update.

See [docs/versioning-and-deployment.md](docs/versioning-and-deployment.md) for the full versioning, branching, and multi-client rollout strategy.

## License

Private project. All rights reserved.
