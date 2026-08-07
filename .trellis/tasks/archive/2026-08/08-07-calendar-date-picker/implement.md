# Implement: Calendar date picker for scheduled date field

## 执行清单

### 1. 装依赖
- [ ] `pnpm --filter @taskora/frontend add react-day-picker`
- [ ] 确认 `date-fns` 作为 transitive 依赖存在（`react-day-picker` v9+ 内置）

### 2. 新建 Calendar 基础组件
- [ ] `packages/frontend/src/components/ui/calendar.tsx`
  - 基于 `react-day-picker` `DayPicker`，`mode="single"`
  - `classNames` prop 注入 Tailwind class，走 CSS 变量（`primary`/`accent`/`muted`/`ring`）
  - 选中态 `bg-primary text-primary-foreground`；今日 `text-primary font-semibold`
  - 暗色适配：依赖现有 `.dark` CSS 变量，不硬编码色值
  - 导出 `Calendar`，接受 `selected`/`onSelect`/`locale`/`initialFocus` props

### 3. 重写 ScheduledDateField
- [ ] `packages/frontend/src/components/task/fields/ScheduledDateField.tsx`
  - 删除三态 segmented control + `<input type="date">`
  - 用 `IconPopover`（`PopoverContent`）内放 `<Calendar>` + 底部操作行
  - `selected` 仅 `scheduledType === DATE` 时传 `scheduledDate`
  - 点日历 → `onPatch({ scheduledType: DATE, scheduledDate })`
  - 底部三按钮：「今天」/ 「Someday」/ 「清除」
  - 「今天」点击后关闭 Popover（需用 `Popover` 的受控 open 态或 `PopoverClose`）
  - Someday 按钮在 `scheduledType === SOMEDAY` 时高亮（`variant="secondary"`）
  - 清除按钮在 `scheduledType === NONE` 时 disabled
  - locale 解析：按 `i18n.language` 取 `react-day-picker` 对应 locale（`zh` / `en`）

### 4. i18n
- [ ] `common.json`（en + zh）新增 `clear` key（`"Clear"` / `"清除"`）
- [ ] 其余复用：`common:today`、`task:somedayLabel`

### 5. 更新 spec
- [ ] `.trellis/spec/frontend/component-guidelines.md`「日期编辑 Popover」段落
  - 计划日期 Popover 改为「月历面板 + 底部 今天/Someday/清除」描述
  - 明确 `scheduledType` 由动作派生，不再有 segmented control 中间态

## 验证命令
```bash
pnpm --filter @taskora/frontend typecheck   # tsc --noEmit
pnpm --filter @taskora/frontend build       # vite build
pnpm --filter @taskora/frontend lint         # eslint
```

## 风险点 / 回滚
- `react-day-picker` v9 API（`classNames` 结构、`mode="single"`）与旧版差异较大；若装到旧版需对照其文档调整 `classNames`
- 回滚：`git checkout ScheduledDateField.tsx` + 删 `calendar.tsx` + `pnpm remove react-day-picker`

## review gates
- 日历在 light/dark 下选中态、今日标记正确
- SOMEDAY / NONE 时日历无错误高亮
- Today 视图、Upcoming 视图、Someday 视图行为回归正常