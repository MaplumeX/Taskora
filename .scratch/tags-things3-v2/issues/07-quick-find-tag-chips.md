# 07 Quick Find `#tag`：补全、chip、搜索页

Status: implemented — awaiting visual acceptance
Blocked by: 04, 06

## Problem

Quick Find 只能跳到 Tag 页，不能「在某个 Tag 里搜」。

## Design

见 spec 第 5 节。

- 纯 reducer `components/search/quickFindInput.ts`：状态是 `{ chips, text, completion }`，处理以下事件：输入、`#` 进入补全、`Enter` / `Tab` 确认、空格自动转换（唯一同名）、`Esc` 退出补全、开头 `Backspace` 删 chip、IME 组字。
- `quickFindResults.ts`：有 chip 时隐藏「列表」「标签」组，「区域与项目」组按 chip 过滤；补全状态下只显示 Tag 候选。
- `QuickFind.tsx`：输入框前渲染 chip；「继续搜索」带上 `tag` 参数。
- `pages/Search.tsx`：从 URL 读 `tag` 参数，显示可删除的 chip，改动以 replace 方式写回 URL。

## Acceptance

- reducer 测试覆盖 spec 中列出的每一种键盘行为。
- 组件测试：`#工` → Enter → 输入「报告」→ 只出现命中「工作」子树的任务；继续搜索后 URL 往返不丢 chip。
- 桌面 + Android 目视验收（移动端没有 Tab，靠点击和空格转换）。

## Comments

### 2026-10-06 — 实现

- 纯函数 `components/search/quickFindInput.ts`：`tagTokenAt`、`removeToken`、`tagCompletions`、`autoChipOnSpace`。没有做成 reducer：状态只有 chips / 文字 / 光标 / 是否退出补全，面板里直接用 useState 更清楚。
- `quickFindResults.ts`：`buildQuickFindGroups` 增加 `tagIds` / `inTags`；有 chip 时没有「列表」「标签」组，只有 chip 也出结果；`searchRoute(query, tagIds)` 带 `tag` 参数。
- `useSearchTagScope(tagIds)`：「区域与项目」组的判定，Project 看有效 Tag、Area 看自身 Tag，子树命中、chip 之间 AND。面板和搜索页共用。
- `SearchTagChips`：输入框前的 chip，带 ×。
- 面板：补全期间正在输入的 `#xxx` 不参与任务搜索；Esc 走 Dialog 的 `onEscapeKeyDown`，补全中只退出补全；改写文字后用 `setSelectionRange` 放回光标。
- 搜索页：读 `?tag=`（可重复），显示可删除的 chip；改搜索词时保留 chip；清空按钮同时清掉 chip。搜索页不支持在这里新加 `#` chip（spec 只要求显示和删除）。
- `docs/keyboard-shortcuts.md` 增加面板内 `#tag` 的键位。
- 测试：纯函数 7 个、分组推导 3 个、面板 4 个（补全转 chip、Esc、空格自动转换与 Backspace、继续搜索带 chip）、搜索页 1 个。
- 未做：真实 App 里的目视验收（尤其是移动端：没有 Tab，靠点击和空格转换；chip 多时输入框的横向滚动）。
