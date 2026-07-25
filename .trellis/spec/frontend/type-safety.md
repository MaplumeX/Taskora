# Type Safety

> Type safety patterns in this project.

---

## Overview

- TypeScript strict 模式（继承根 `tsconfig.base.json`）
- 共享类型在 `@taskora/shared` 包
- 前端专用类型在 `src/types/`

---

## Type Organization

### 从 shared 引用（CRITICAL）

所有 DTO 和枚举必须从 `@taskora/shared` 引用：

```typescript
import type { CreateTaskDto, TaskResponseDto, TaskBucket } from '@taskora/shared';
```

禁止在前端重复定义与 shared 包相同的类型。

### 前端专用类型

非共享的类型定义在 `src/types/`，如查询参数、UI 状态类型。

---

## Common Patterns

### Query 参数类型

查询参数 DTO（如 `TaskQuery`）可以本地定义，因为它是前端查询封装，不是传输 DTO：

```typescript
// 本地定义（合理）
export interface TaskQuery {
  view?: 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash';
  projectId?: string;
  parentId?: string;
}
```

### Enum 的运行时 import（vite alias 方案）

`@taskora/shared` 只产 CommonJS 编译产物（`dist/`），Vite/Rollup 无法从 barrel file 的 `__createBinding` getter 静态分析运行时 enum 导出。`import type` 会被擦除不触发问题，但一旦代码在运行时使用 enum 值（如 `ScheduledType.DATE`），rollup 会报 `is not exported by ../shared/dist/index.js`。

解决方案：在 `vite.config.ts` 中加 alias 让 vite 直接编译 shared 源码：

```typescript
// vite.config.ts
resolve: {
  alias: {
    '@taskora/shared': path.resolve(__dirname, '../shared/src'),
  },
}
```

`tsconfig.json` 仍走 `dist/*.d.ts`，类型检查与运行时互不影响。前端可正常运行时使用 enum：

```typescript
import { ScheduledType } from '@taskora/shared';
const type = ScheduledType.DATE;  // ✅ 运行时可用
```

> ⚠️ 改动 shared 源码后需 `pnpm --filter @taskora/shared build` 刷新 `.d.ts`，否则前端类型检查会滞后。

---

## Forbidden Patterns

- ❌ `any` — 用 `unknown` 或具体类型
- ❌ 前端重复定义 shared 包已有的 DTO
- ❌ `as` 断言滥用（enum 值应直接用 `ScheduledType.DATE` 形式，不再需要 `as TaskBucket` 字面量断言）