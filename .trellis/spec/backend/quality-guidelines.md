# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

后端代码质量标准。所有代码必须通过 `pnpm lint` 和 `pnpm typecheck`。

## Monorepo 约定

- 包名统一用 `@taskora/*` 命名空间
- 包间依赖用 `"workspace:*"` 协议
- TS 配置继承根 `tsconfig.base.json`：`"extends": "../../tsconfig.base.json"`
- 根 scripts 用 `pnpm -r --parallel run <script>` 并行执行所有 workspace

---

## Forbidden Patterns

### 不带 userId 的数据查询

所有 Prisma 业务查询必须包含 `userId` 隔离，严禁仅用 `id` 查询。

### 根目录直接安装依赖

禁止在根 `package.json` 安装业务依赖。仅 dev 工具（ESLint、Prettier、TypeScript）可放根。业务依赖放各子包。

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

- [ ] 所有 Prisma 查询包含 userId 隔离
- [ ] DTO 从 `@taskora/shared` 引用，不重复定义
- [ ] 输入校验（class-validator 装饰器）已添加
- [ ] `pnpm lint` 和 `pnpm typecheck` 通过
