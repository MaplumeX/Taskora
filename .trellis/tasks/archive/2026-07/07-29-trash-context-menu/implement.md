# Implement — Trash task context menu with restore

## 执行清单

- [ ] 1. 改 `TaskContextMenu.tsx`
  - [ ] 1.1 `Props` 增加 `variant?: 'default' | 'trash'`，默认 `'default'`。
  - [ ] 1.2 引入 `useRestoreTask`；在 `variant === 'trash'` 时使用 `handleRestore`，否则沿用 `handleDelete`。
  - [ ] 1.3 末项文案：`trash` → `tc('restore')`，`default` → `tc('delete')`。
  - [ ] 1.4 末项 `onSuccess` 行为：恢复成功后 invalidate `['tasks']`（与 `useRestoreTask` 自身 invalidation 对齐）。
- [ ] 2. 改 `Trash.tsx`
  - [ ] 2.1 为每行包裹 `<TaskContextMenu task={task} current={task} variant="trash">`。
  - [ ] 2.2 移除行尾 `<Button>` 恢复按钮。
  - [ ] 2.3 移除不再使用的导入：`useRestoreTask`、`RotateCcw`、`Button`、`handleRestore`、`toast`（如已无其它使用）。
- [ ] 3. 验证（见下）。

## 验证命令

```bash
# 类型 / 构建
pnpm --filter frontend typecheck
pnpm --filter frontend build

# lint（如有）
pnpm --filter frontend lint
```

## 回归点（人工验证）

1. 普通任务页（Today/Inbox/Upcoming 等）右键菜单：末项仍为「删除」，功能不变。
2. 废纸篓页右键菜单：5 项，末项「恢复」；点击恢复后任务从废纸篓消失。
3. 废纸篓行尾无内联恢复按钮。
4. 废纸篓行的标记完成 / 日期 / 标签 picker 正常打开与提交。
5. 中英文文案正确。

## 回滚点

单 commit 提交；如出问题 revert 该 commit 即可。