# 04：键盘、添加并继续、提交反馈

Status: implemented — awaiting desktop verification
Blocked by: 02, 03

## Problem

卡片的字段变多后，要能只用键盘完成填写和提交；提交后也要有明确的反馈。

## Design

见 spec 第 4、5 节。

- 键位与主应用 keymap 一致：⌘S / ⌘T / ⌘O / ⇧⌘D / ⇧⌘T / ⇧⌘M；Windows 用 Ctrl 系。浮窗是独立的 webview，不装配主应用的 keymap registry，在卡片内单独处理即可，但键位定义要从同一处常量引用。
- 提交：
  - 标题框内按 ↵，或任意位置按 ⌘↵：添加并关闭。
  - ⇧⌘↵：添加并继续，即清空标题、备注和字段，保留归属，焦点回到标题框。
  - `isComposing` 时的 Enter 一律不提交。
- Esc 分层处理：有选择器开着时只关闭选择器；没有时清空草稿并关闭窗口。
- 反馈：关闭前播放勾选加淡出动画；「添加并继续」时在卡片内显示短暂提示「已添加到 X」。
- 更新 `docs/keyboard-shortcuts.md`，在「全局」一节补上 Quick Add 卡片内的键位。

## Acceptance

- 只用键盘可以完成：打开 → 写标题 → ⌘S 选明天 → ⇧⌘T 选 Tag → ⇧⌘M 选项目 → ↵ 提交。
- 中文输入法组字时按 Enter 不会误提交。
- 连续添加 3 条任务，归属一直保持不变。

## Comments

### 2026-10-02：实现

- ↵、⌘↵、⇧⌘↵、Esc 分层、输入法组字保护这几项，已在 03 里随卡片实现（见 03 的 Comments）。
- 字段快捷键：
  - `keymap.ts` 新增 `resolveQuickAddAction` 和 `quickAddShortcutLabel`。主应用的 keymap 目前只实现了 ⇧⌘T，⌘S / ⌘T / ⌘O / ⇧⌘D / ⇧⌘M 还只是文档 P1 / P2 里的规划键位，Quick Add 先用上这套键位。以后主应用实现时，两边可以共用解析逻辑。
  - 卡片在根节点的捕获阶段统一处理：⌘T / ⌘O 直接改草稿；⌘S / ⇧⌘D / ⇧⌘T / ⇧⌘M 打开对应的选择器。所有命中的快捷键都会 `preventDefault`，拦住 webview 自己的 ⌘S 等默认行为。
  - `FieldPicker`、`FieldChip`、`FieldIconButton` 新增受控的 `open` / `onOpenChange` 和 hint 键位 `shortcut`，不传时行为与原来一致。卡片里各字段的 chip 和图标都是受控的，快捷键与点击走同一个状态。
- 反馈：
  - 卡片底部加了一行键位提示（↵ 添加 · ⇧⌘↵ 添加并继续 · Esc 关闭），各字段图标的 hint 上也显示键位。
  - 「添加并继续」的提交，requestId 记进 `continuedRequests`，收到主窗口回执后在卡片下方显示「已添加到「X」」2.5 秒；失败则显示错误。其余提交发出时窗口已经隐藏，失败由主窗口的 toast 和系统通知呈现。
  - 「添加并关闭」的勾选淡出动画，用的就是 02 的出场动画，没有另做勾选效果。
- 文档：`docs/keyboard-shortcuts.md` 的「全局」一节新增「Quick Add 卡片内（桌面）」键位表。
- 测试：`keymap.test.ts` 新增 4 条；`QuickAddCard.test.tsx` 新增 2 条（⌘T / ⌘O 设日期并提交、快捷键打开归属和 Tag 选择器）。
- **未验证（需要实机）**：spec 里的完整键盘流程，即打开 → 写标题 → ⌘S 选明天 → ⇧⌘T 选 Tag → ⇧⌘M 选项目 → ↵，以及 webview 里 ⌘S 不会触发其他行为。
