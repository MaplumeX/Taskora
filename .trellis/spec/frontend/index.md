# Frontend Development Guidelines

> Specs for frontend development in this project (React + Vite + TanStack Query + Zustand + dnd-kit + i18next + shadcn/ui).

---

## Overview

This directory contains guidelines for `packages/frontend/` (`@taskora/frontend`). All specs reflect the actual codebase as it exists now.

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Directory Structure](./directory-structure.md) | Module organization, file layout, stores, api/hooks |
| [Component Guidelines](./component-guidelines.md) | Component patterns, theme, DnD, sidebar drag, inline edit |
| [Hook Guidelines](./hook-guidelines.md) | TanStack Query patterns, reorder mutations, query keys |
| [State Management](./state-management.md) | TanStack Query / Zustand / Router, token recovery, interceptor |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, routing, testing |
| [Type Safety](./type-safety.md) | shared import rules, enum runtime, vite alias |
| [i18n Guidelines](./i18n-guidelines.md) | i18next setup, namespaces, FOUC, zh/en parity |

---

## How These Guidelines Are Maintained

Each guideline file documents the project's **actual conventions** with code examples from the codebase. When the codebase changes, the relevant spec must be updated in the same PR.

---

**Language**: All documentation should be written in **English**.
