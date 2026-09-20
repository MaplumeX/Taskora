# 系统托盘与关窗驻留

Status: resolved

## Problem

Windows/Linux 上关闭主窗口 = 进程退出(`lib.rs` 显式 `exit(0)`),
全局快捷键(quick-add)随之失效——quick-add 的「随时唤起」只在
macOS(关窗藏 Dock)成立。也没有托盘入口让用户重新唤起或退出。

## Solution

- `tauri` 加 `tray-icon` feature;tray 菜单:**Show Taskora /
  New Task / Quit**。
- 托盘左键点击(Windows/Linux)→ 显示主窗口;New Task → 复用
  quick-add 显示逻辑(与全局快捷键同一路径)。
- Windows/Linux:关闭主窗口改为 hide 驻留;退出走托盘 Quit。
- macOS:维持现状(关窗藏窗口、Dock 常驻,Reopen 事件已处理)。
- 菜单文案 v1 用英文(Rust 侧拿不到 i18n 状态;本地化留待后续)。

## Testing seams

纯装配层(Tauri builder / tray icon),无合理单测接缝;以
`cargo check` + 手动验收覆盖。

## Comments

## Answer

已实现:`tray-icon` feature + TrayIconBuilder(菜单 Show Taskora /
New Task / Quit;左键点击显示主窗口);Windows/Linux 关主窗口改为
hide 驻留,退出统一走托盘 Quit;macOS 行为不变。quick-add 显示逻辑
抽为 `show_quick_add` 供快捷键与托盘共用。
