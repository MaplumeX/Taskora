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

### Enum 的 type-only import（已知权衡）

`@taskora/shared` 导出 CJS 编译产物。Vite/Rollup 无法通过 barrel file 静态解析运行时 enum 重导出。当前用 `import type` + 字面量断言：

```typescript
import type { TaskBucket } from '@taskora/shared';
// 运行时用字面量
const bucket = 'INBOX' as TaskBucket;
```

未来修复：将 `@taskora/shared` 切换为 ESM 输出。

---

## Forbidden Patterns

- ❌ `any` — 用 `unknown` 或具体类型
- ❌ 前端重复定义 shared 包已有的 DTO
- ❌ `as` 断言滥用（除 enum 字面量的已知权衡外）