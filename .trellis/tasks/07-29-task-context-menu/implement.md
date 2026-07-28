# Implement — Task item context menu

执行前确认 `task.py current` 指向本任务。所有编辑遵循「精准修改」：只动必要文件，匹配现有代码风格。

## 实现清单（按序）

### 1. i18n 新增 key
- `packages/frontend/src/i18n/locales/zh/task.json`：+ `"markComplete": "标记完成"`, `"markIncomplete": "标记未完成"`
- `packages/frontend/src/i18n/locales/en/task.json`：+ `"markComplete": "Mark Complete"`, `"markIncomplete": "Mark Incomplete"`

### 2. 抽取共享 Field 组件
新建 `packages/frontend/src/components/task/fields/`：
- `ScheduledDateField.tsx` — 从 `TaskRowExpanded` 的「计划日期」IconPopover 内容迁出
- `DueDateField.tsx` — 迁出「到期日期」input 内容
- `TagsField.tsx` — 迁出「标签」多选列表内容

每个组件 props: `{ current: TaskResponseDto; onPatch: (data: UpdateTaskDto) => void }`。

### 3. TaskRowExpanded 改用 Field 组件
- 用三个新 Field 替换原有的 IconPopover 内联 JSX。
- 保留 IconPopover 作为 trigger 容器（轮子不重造），仅把 children 替换为 `<ScheduledDateField .../>` 等。
- 不改变现有交互与视觉。

### 4. 新建 TaskContextMenu 组件
文件：`packages/frontend/src/components/task/TaskContextMenu.tsx`
- props: `{ task: TaskResponseDto; current: TaskResponseDto; children: ReactNode }`
- 内部 hooks: useUpdateTask / useCompleteTask / useUncompleteTask / useDeleteTask（与 TaskRowExpanded 同样的 patch/invalidation/toast 模式）
- state: menuOpen / anchor / activePicker（见 design M4）
- 渲染 `{children}` 作为可见内容，并在其上挂 onContextMenu。
- 主菜单 Popover（PopoverAnchor 虚拟坐标）渲染菜单项 button 列表。
- picker Popover 受 activePicker 控制渲染对应 Field。

### 5. TaskItem 集成 TaskContextMenu
- 在 `TaskItem.tsx` 根 `div` 上引入 `TaskContextMenu` 包裹行内容，传入 task/current。
- 确保不破坏 onClick 展开、onToggleComplete、拖拽等现有行为。

### 6. 键盘可达性基础
- 菜单打开 autoFocus 首项；Esc 关闭；项间 Tab 移动 + Enter 触发。
- 菜单按钮带 aria-label（日期/标签用现成 i18n key）。

## 验证命令

```bash
# 类型 / lint
pnpm -F @taskora/frontend typecheck
pnpm -F @taskora/frontend lint
# 单测（如有 task 组件测试）
pnpm -F @taskora/frontend test --run
```

## 手动回归清单（check 阶段重点）

- [ ] 右键主任务行 → 菜单出现在鼠标处，非浏览器默认菜单。
- [ ] 标记完成 → 该行完成态切换 + 列表刷新一致。
- [ ] 标记未完成（对已完成任务）→ 恢复。
- [ ] 设置计划时间：DATE + 选日期 → TaskDateBadge 反映；NONE → 清除；SOMEDAY。
- [ ] 设置到期时间：选日期 → TaskDueDateBadge 反映；清空 → 清除。
- [ ] 设置标签：多选切换 → 行内标签色点反映。
- [ ] 删除 → 任务消失（软删除，Trash 可见）。
- [ ] **回归**：展开行的三个 picker 仍正常工作（抽取未破坏）。
- [ ] **回归**：点击展开 / 完成勾选 / 拖拽排序 未受影响。
- [ ] 中英文文案齐全。

## 风险文件 / 回滚点

- `TaskRowExpanded.tsx`（抽取回归风险）→ 如出问题，可回退为内联 JSX（Field 组件保留备用）。
- `TaskItem.tsx`（集成点）→ 仅增加包裹层，回滚简单。
