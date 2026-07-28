# Backend Development Guidelines

> Specs for backend development in this project (NestJS + Prisma + PostgreSQL).

---

## Overview

This directory contains guidelines for `packages/backend/` (`@taskora/backend`). All specs reflect the actual codebase as it exists now.

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Directory Structure](./directory-structure.md) | Module organization, file layout, bootstrap |
| [Database Guidelines](./database-guidelines.md) | Prisma patterns, models, migrations, reorder |
| [Error Handling](./error-handling.md) | Error types, refresh token rotation, CSRF |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, controller/service patterns, testing |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, what to log / not log |

---

## How These Guidelines Are Maintained

Each guideline file documents the project's **actual conventions** with code examples from the codebase. When the codebase changes, the relevant spec must be updated in the same PR.

---

**Language**: All documentation should be written in **English**.
