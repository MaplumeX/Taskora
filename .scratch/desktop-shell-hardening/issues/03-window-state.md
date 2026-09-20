# 主窗口状态记忆

Status: resolved

## Problem

主窗口每次启动固定 1200×800 居中(`tauri.conf.json`),不记忆用户
上次的位置与尺寸。

## Solution

- 接入 `tauri-plugin-window-state` 2.x(本地缓存已有 2.4.1)。
- `with_denylist(&["quick-add"])`:quick-add 是无边框居中浮窗,
  不记忆其状态。

## Testing seams

纯配置层,以 `cargo check` + 手动验收覆盖。

## Comments

## Answer

已实现:tauri-plugin-window-state 2.x,`with_denylist(["quick-add"])`,
StateFlags 去掉 VISIBLE(关窗驻留的隐藏状态不泄漏到下次启动)。
