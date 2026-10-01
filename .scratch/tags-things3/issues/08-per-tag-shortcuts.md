# 08 每个 Tag 绑定快捷键（第二期）

Status: deferred
Blocked by: 04, 05, 07

## Problem

Things 3 可以给每个 Tag 绑定一个快捷键：选中条目时按下就切换这个 Tag，在列表里按下就按它过滤。

## Open questions

- `docs/keyboard-shortcuts.md` 约定「键位硬编码，不做用户配置」，这一条需要先改约定，或者限定为 Tag 专用的有限空间（例如 mac `⌃` + 字母、Windows `Ctrl+Alt` + 字母、Web `Alt+Shift` + 字母），并和现有键位做冲突检测。
- 存储：给 Tag 加一个同步字段 `shortcut`（经 LWW 同步到各设备），还是做成设备本地设置。倾向于同步字段，因为它和 Tag 本身一起才有意义。
- 同一个键在「有 Selection」和「没有 Selection」时分别表示打标和过滤，是否会让人困惑。

## Comments
