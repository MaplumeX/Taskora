# 04 桌面端打字唤起

Status: implemented — awaiting desktop acceptance
Blocked by: 02

## Problem

Things 3 在 Mac 上直接打字即可搜索，Taskora 必须先按 `⌘F`。

## Design

见 spec 第 5 节。要点：

- `keymap.ts` 新增动作（如 `{ type: 'typeToFind', char }`），只在非触控平台、无修饰键（允许 Shift）、单个可打印字符时产生；排除空格及已占用的单键。
- 派发前的条件（焦点不在可编辑元素、无弹窗、无 Selection）在 `KeyboardShortcuts` 中判断，与现有动作的上下文判断方式一致（ADR-0004）。
- 打开面板并以该字符作为初始输入；IME 组合输入（`isComposing` / `key === 'Process'`）只打开并聚焦，不带入字符。

## Acceptance

- 在 Today 中无 Selection 时敲「a」：面板打开，输入框为「a」，后续击键继续进入输入框。
- 有 Selection、焦点在输入框、或弹窗已打开时不触发。
- 空格仍是「下方新建」；中文输入法下首键不产生多余字符。

## Comments

### 2026-09-30 — 实现

- keymap：新增动作 `{ type: 'typeToFind', seed }`。无 ⌘/Ctrl/Alt（允许 Shift）的单个可打印字符触发，seed 即该字符；空格仍是 `newTaskBelow`。输入法组合的首键（`isComposing`、`keyCode === 229`、`key === 'Process'`）产生空 seed。`KeyEventLike` 新增可选字段 `isComposing` 和 `keyCode`。
  - 顺带修正：原先无修饰的 `1`–`6` 和 `n`/`N` 在各自分支里直接 `return null`，现在只有带修饰键时才进入这两个分支，否则落到打字唤起。这是新测试发现的：原本敲 `n` 不会唤起。
- 前提检查（`KeyboardShortcuts` 的 `canTypeToFind`）：没有 Selection、不在 `/agent`（该页不挂载 Quick Find，之前按 `⌘F` 也只会留下一个悬空的 `searchOpen`）、不是粗指针（`(pointer: coarse)`）。可编辑目标和浮层的让路沿用原有逻辑。只有通过检查才 `preventDefault`。
- store：新增 `searchSeed`、`openSearch(seed?)`、`takeSearchSeed()`；`setSearchOpen(false)` 会清掉 seed。`⌘F` 改用 `openSearch()`，打开时不带字符。
- 面板：打开时取用 seed 填入输入框；聚焦改为 Radix 的 `onOpenAutoFocus`（Dialog 挂载即聚焦），替换原先的 `setTimeout`，避免首键之后的快速击键落到页面上丢失。
- ~~已知限制：输入法用户按下的第一个键会丢失~~ 实际是首键以英文字母带入（页面无可编辑焦点时浏览器不把按键交给输入法）。后续修复：`KeyboardShortcuts` 渲染一个隐藏输入框（`data-type-to-find-sink`），在可以打字唤起且焦点落在 body（或清空 Selection 后残留在旧行上）时持焦；IME 在其中从首键起组字，上屏后以上屏文字为 seed 唤起。keydown 在它上面且处于组字（`isComposing` / `keyCode 229`）时全部让路；其余按键照常派发。
- 文档：`docs/keyboard-shortcuts.md` 的全局表新增「打字唤起」一行及说明。
- 测试：
  - keymap：字母、Shift、数字、符号、CJK 字符、输入法首键、空格，以及带修饰键或非字符键不唤起；原来「无修饰字母键不触发动作」和「普通字符输入不触发动作」两条按新语义改写。
  - `KeyboardShortcuts`：唤起与 seed、输入法首键、有 Selection、焦点在输入框、空格、助手页、粗指针、`⌘F` 不带 seed。
  - `QuickFind`：seed 填入、自动聚焦、后续输入接在其后。
- 验证：全部包 typecheck 通过，eslint 通过。api 341、ui 388、desktop 51、mobile 72、frontend 16 个测试通过。
