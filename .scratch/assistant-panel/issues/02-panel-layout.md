# 02 — 面板组件与 AppShell 布局（推挤 / 覆盖）

Status: implemented — awaiting visual acceptance
Blocked by: 01

## Problem

需要一个桌面端右侧助手面板，能和列表并排，也不能在窄屏或 Calendar 上把内容挤坏。

## Design

见 spec 第 3 节。

- `uiInteraction.store` 新增 `assistantPanelOpen` 及开关方法，开关状态持久化到本机。
- 新组件 `packages/ui/src/components/agent/AssistantPanel.tsx`，挂在 `AppShell` 主列右侧，仅 `md` 以上渲染，`/agent` 路由下不渲染。
- 推挤 / 覆盖：视口 ≥ 1440px 且非 Canvas 路由 → 推挤；否则覆盖（阴影，Esc / 点外部收起）。断点判断用 media query hook，避免布局抖动。推挤时 `MainContent` 列表容器的 `md:px-12` 可收窄。
- 顶栏：会话标题下拉（最近会话 + 新建）、↗（04 实现行为，此处占位）、关闭。
- 主体复用 `AgentChatView`。过程折叠（`AgentTurn` 的 `ProcessBlock`）已是默认行为，面板只需收窄消息列的外边距（`px-4 md:px-6` 在 360px 内偏宽）；不新增折叠相关 prop。
- 未配置 BYOK 时显示去设置的引导。
- i18n：新增面板相关文案（zh / en）。

## Acceptance

- 1920 / 1440 宽：面板推挤，列表完整可见、可操作；点列表不收起面板。
- 1280 宽与 `/calendar`：面板覆盖，Esc 与点外部可收起。
- 移动端与 `/agent` 不出现面板。
- 刷新后面板开关状态保持。

## Comments

### 2026-10-02 — 实现

- `components/agent/AssistantPanel.tsx`，挂在 `AppShell` 主列右侧。`useAssistantPanelMode()`：非桌面 / 关闭 / `/agent` → hidden；≥1440px 且非 Canvas 路由 → push；否则 overlay（透明遮罩点外部收起、Esc 收起，面板内菜单打开时 Esc 先给菜单）。
- push 时没有收窄 `MainContent` 内边距：列表容器 `max-w-3xl` 含内边距共 768px，1440 宽打开面板后主区仍有 840px，不会被挤。
- 遮罩条件渲染在前、aside 固定在后：push ↔ overlay 切换（缩放窗口、进出日历）不重挂面板，草稿和订阅都在。
- 面板顶栏：标题下拉（最近 8 个会话 + 新建 + 「所有会话…」去全屏）、新建、全屏、关闭。主体 `AgentChatView variant="panel"`（只收窄外边距）。空状态抽成 `AgentEmptyState`，与全屏共用。
- 打开时聚焦输入框，关闭时焦点还给打开前的元素。
- `SyncIndicator` 在面板打开时让到面板左侧，不压输入框。
- 测试：`AssistantPanel.test.tsx`（三种模式、Esc / 遮罩、与全屏互切、标题下拉切换会话）。

### 2026-10-02 — 追加：拖动调宽

- 用户验收时提出面板应能调宽，从「明确不做」移入范围。
- `useAssistantUiStore.panelWidth`（本机持久化，默认 360，下限 320）；渲染时上限钳到视口一半。
- 左边缘 `role="separator"` 把手：拖动只改本地宽度，松手才写 store；双击恢复 360；←/→ 每次 16px。
- push / overlay 的切换阈值仍按视口 1440px，不随面板宽度变：宽屏上拉宽面板，挤的是列表留白，是用户自己的选择。
- `SyncIndicator` 的避让偏移改用面板宽度（CSS 变量）。
- 测试：`AssistantPanel.test.tsx` 新增拖动 / 钳制 / 双击 / 键盘。
