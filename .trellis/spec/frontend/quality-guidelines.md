# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

前端代码质量标准。所有代码必须通过 `pnpm lint` 和 `pnpm typecheck`。

## Monorepo 约定

- 包名统一用 `@taskora/*` 命名空间
- 包间依赖用 `"workspace:*"` 协议
- TS 配置继承根 `tsconfig.base.json`：`"extends": "../../tsconfig.base.json"`

---

## Forbidden Patterns

### 重复定义 DTO 类型

禁止在前端定义与 `@taskora/shared` 重复的 DTO。所有 DTO 必须从 shared 引用。

### 根目录直接安装依赖

禁止在根 `package.json` 安装业务依赖。仅 dev 工具可放根。

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

- [ ] DTO 从 `@taskora/shared` 引用，不重复定义
- [ ] TanStack Query key 符合约定（`['tasks', { view }]`）
- [ ] 变更后 invalidate 相关 query
- [ ] `pnpm lint` 和 `pnpm typecheck` 通过
