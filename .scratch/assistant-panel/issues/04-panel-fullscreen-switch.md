# 04 — 面板与全屏互相切换

Status: implemented — awaiting visual acceptance
Blocked by: 01, 02

## Design

见 spec 第 1、2 节。

- 面板顶栏 ↗：收起面板并 `navigate('/agent')`，全屏打开同一个 `activeConversationId`。
- `/agent` 顶栏新增「收回到面板」按钮（仅桌面端）：返回上一个页面（无历史时去 `/today`）并打开面板，对话不变。在 `/agent` 按 03 的快捷键效果相同。
- 进入 `/agent` 时（侧边栏、↗、直接访问）面板自动收起。

## Acceptance

- 助手运行中从面板切到全屏、再收回，打字效果与运行中的工具状态连续，没有重复消息。
- 侧边栏点「助手」时面板收起，全屏显示的是面板中的那个对话。
- 直接打开 `/agent` 后点「收回」能回到合理页面。

## Comments

### 2026-10-02 — 实现

- 面板 ↗ 与标题下拉的「所有会话…」都 `navigate('/agent')`；面板对路径变化监听，进入 `/agent` 即收起（只在路径变化时触发，因此从 `/agent` 收回时先开面板、再异步后退不会被误关）。
- `useDockToPanel()`：打开面板，有应用内历史（`location.key !== 'default'`）就后退，否则去 `/today`。`/agent` 顶栏的收回按钮（仅桌面）和 ⌘J 共用它。
- 对话连续性靠 01 的共享状态与 2s 宽限期。
