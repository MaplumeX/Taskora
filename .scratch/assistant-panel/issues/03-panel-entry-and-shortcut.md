# 03 — 底部动作条按钮与快捷键

Status: implemented — awaiting visual acceptance
Blocked by: 02

## Design

见 spec 第 1、4 节。

- `ContentBottomBar` 在 🔍 搜索右侧加 ✦ 助手按钮（图标与侧边栏助手入口一致），Hint 带快捷键；`assistantPanelOpen` 为真时激活态。
- `keymap.ts` 新增动作 `toggleAssistantPanel`：desktop ⌘J / Ctrl+J，web Alt+J。`KeyboardShortcuts` 派发到 store。
- 面板打开时自动聚焦输入框；输入框聚焦时同一快捷键仍能收起面板（keymap 对输入框让路的规则需为它开例外），收起后焦点回到之前的元素。
- 更新 `docs/keyboard-shortcuts.md`。

## Acceptance

- 三个平台的键位都能开关面板，且不与现有键位冲突（`keymap.test.ts` 覆盖）。
- 在面板输入框中按快捷键可收起面板，焦点复原。
- 底部按钮激活态与面板状态一致。

## Comments

### 2026-10-02 — 实现

- 底部动作条在搜索右侧加助手按钮，图标用侧边栏同款 `Bot`（spec 写的 ✦ 改为与现有入口一致），`aria-pressed` 跟随面板状态，Hint 带键位。
- `keymap.ts`：`toggleAssistantPanel`，mac ⌘J / Windows Ctrl+J / Web Alt+J；`HintableAction` 与 `SHORTCUT_LABELS` 同步。
- `KeyboardShortcuts`：该动作先于「编辑态让路」处理——焦点在 `[data-assistant-panel]` 内的输入框时照常收起，其他输入框里让路；窄于 768px 不响应；在 `/agent` 上等同收回到面板。
- `docs/keyboard-shortcuts.md` 已更新。
- 测试：`keymap.test.ts`、`KeyboardShortcuts.test.tsx`、`ContentBottomBar.test.tsx`。
