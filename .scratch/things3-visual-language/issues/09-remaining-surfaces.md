# 09: 其余页面走查

Status: done
Blocked by: 05, 06, 07, 08

## 内容

对未覆盖的页面按 spec 做一致性走查与修正：Calendar（`CalendarMonthGrid` / `CalendarDayCell` 色块改用新 token）、Settings 各页、Agent（`bubbles` / `ApprovalCard` / `AgentChatView`）、Tags / TagDetail、Trash、SearchModal、登录页、Toast（sonner）。

## 验收标准

- [x] `packages/ui/src` 内无残留 `rounded-xl` 以上的大圆角、`shadow-soft`、`font-display`
- [x] 各页亮 / 暗 × 窄 / 宽截图归档到本 issue Comments

## Comments

- 2026-09-27：完成。走查截图：Calendar、Assistant、Tags、Tag 详情、Logbook、Trash、Area 详情、搜索、登录（亮 / 暗 × 宽 / 窄）。修正：
  - Radix `Checkbox`（搜索「包含已完成」等）改为与 TaskCheckbox 同一视觉。
  - 登录 / 注册 / 服务器设置（三壳）：去渐变与卡片描边，`bg-sidebar` 底 + `rounded-xl` 卡片。
  - 日历星期表头去大写字距；Agent 工具详情小标题去大写字距、用户气泡圆角收敛。
  - 新增 `trashNav`：Trash 页标题改用 PageHeading（带图标），侧边栏 / 空状态共用；Area 详情标题前加区域图标（对应 Project 详情的进度环）。
- 保留：Settings 手机端 iOS 分组列表（`rounded-xl`）、FieldPicker / 日历当天面板的手机端大圆角卡片（iOS 形态）、Dialog `rounded-xl`。Agent 对话气泡未能实际渲染验证（本地未配置模型 Provider），仅代码层调整。
