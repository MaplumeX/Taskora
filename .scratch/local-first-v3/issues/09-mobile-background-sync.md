# 09 移动端后台同步

Status: needs-triage

## Problem

ADR-0014 接受了「手机只知道上次打开 App 时同步到的提醒」。在桌面端改了提醒时间，手机在打开 App 前仍按旧时间响。

## Design

- Android WorkManager 周期任务（最短 15 分钟）唤起一个无界面的同步：flush + pull + 重算提醒计划并交给原生插件。
- Tauri 移动端在后台运行 JS 受限：需要确认能否在 headless WebView 中运行 Engine；否则原生侧直接调 `/sync/pull`，只处理与提醒相关的字段变更，写入原生计划（不写副本，下次打开 App 时正常同步）。
- 省电：只在联网且未处于省电模式时运行。

## Acceptance

- App 未打开时，其他设备修改的提醒在一个同步周期内生效。

## Comments
