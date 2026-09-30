# 01: 稍后项目判定函数

Status: done

## 内容

新增前后端共用的纯函数 `laterProjectKind(project, todayKey) → 'scheduled' | 'someday' | null` 与 `isLaterProject`（建议放 `@taskora/shared`）。`todayKey` 由调用方按账号时区给出，口径与 `packages/api/src/utils/date.ts` 的 `todayDateKey` / `toDateKey` 一致。

判定：未了结、未进回收站，且 `SOMEDAY` → `someday`；`DATE` 且计划日期 > 今天 → `scheduled`；其余（含日期为今天 / 已过、`NONE`）→ `null`。

见 spec「单一判定函数」。

## 验收标准

- [x] 单测覆盖：SOMEDAY、DATE 明天 / 今天 / 已过、NONE、已完成、回收站、时区边界（项目没有「已取消」状态，不适用）
- [x] 从 `@taskora/shared` 导出，前后端均可引用

## Comments

- 2026-09-28：完成。`@taskora/shared` 导出 `laterProjectKind` / `isLaterProject` / `hidesTasksInLaterProjects`；客户端 `projectLaterKind`（`utils/date.ts`）与 `useLaterProjectKind`（跨天换引用）。单测在 `packages/api/src/utils/later-project.test.ts`。
