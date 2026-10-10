# Feature: 移入时机（Logging Mode）

Status: implemented (01–06) — 待实机验收

对齐 Things 3 的 Settings → General → Logbook：已了结条目何时离开原视图、进入 Logbook，可选立即 / 每天 / 手动，另有 Log Completed 命令。调研见 `.scratch/logbook/things3-logbook-research.md` 第 6 条与「可选进阶」第 8 条。术语见 `CONTEXT.md`（Logging Mode / Unlogged Item / Log Completed），机制见 ADR 0022。

## Problem Statement

现在只有「立即」：勾选后 `useCompletionRhythm` 停留 600ms 可撤销，然后收起并提交，条目马上离开原视图。习惯「做完的留在眼前、一天结束再清」的用户没有选择。

## Solution

### 1. 设置与推导

- 账号偏好 `loggingMode`：`IMMEDIATE`（缺省）/ `DAILY` / `MANUAL`；`loggedThrough`：ISO 时刻，可空。两者都 LWW 同步（不取最大值，撤销需要回退）。
- `isLogged(item)` 为真，当且仅当满足以下任一条件：
  - 模式为 `IMMEDIATE`；
  - `settledAt` ≤ `loggedThrough`；
  - 模式为 `DAILY` 且了结日（账号时区）早于今天；
  - `settledAt` 早于 Archived Logbook 截止时刻（`archiveCutoff`）。
- 每个条目都按自己的 `settledAt` 判断。完成项目时其内未了结任务同时了结，两者一起移入；早已了结的旧任务不会因为项目刚完成而回到原视图。（设计稿原为「已了结项目内的任务随项目判断」，实现时发现会把早已移入的旧任务拉回原视图，改为此规则，结果在常见情况下一致。）
- 切换模式：从 `IMMEDIATE` 切到 `DAILY` / `MANUAL`，或在 `DAILY` 与 `MANUAL` 之间切换，`loggedThrough` = 现在；切回 `IMMEDIATE` 不写。
- 每天模式跨过账号零点沿用现有日期刷新（30 秒时钟 + 聚焦检查，ADR 0013），不需要定时任务。

### 2. 视图

- Unlogged Item 留在原视图原位（Today、Upcoming、Anytime、Inbox、Someday、Project、Area、Tag 页、侧边栏中的项目），删除线 + 弱化，与 Logbook 行同样式；不沉底。
- Logbook 只显示已移入的条目；项目页的「已了结」折叠面板同样只收已移入的。
- 列表里点已了结条目的勾选框即重开：已完成的撤销完成，已取消的撤销取消（原先只有 Logbook 这样处理，其余列表会把已取消改写为已完成）。
- 侧边栏 / 首页角标与 Android 状态栏常驻通知不计 Unlogged Item；项目进度照常计为已完成。
- Today 的新到判断排除已了结条目（不显示黄点、不计入横幅）。
- Quick Find：Unlogged Item 作为普通结果出现，不进 Logbook 组。
- Calendar 不变（已显示已完成任务）。
- Deadlines：仍只列未了结条目（Unlogged Item 不留在 Deadlines）。见 Open questions。
- 已了结未移入的项目留在侧边栏 / Area 中，删除线，可进入。

### 3. 完成节奏

- 非立即模式下勾选立即提交，勾号照常画出，行不收起；再点即重开（无 600ms 撤销窗）。键盘完成路径一致。
- 重复任务：完成的那条留在原处，新派生的 Repeat Instance 按其日期出现。

### 4. Log Completed

- 全账号生效：`loggedThrough` = 现在。
- 入口：`⇧⌘Y`（Windows Ctrl+Shift+Y，Web Alt+Shift+Y；keymap 注册表，ADR 0004 / 0017，可自定义）、任务 / 项目右键菜单、Logbook 页顶部按钮。立即模式下全部隐藏。
  - 设计稿里的「命令面板」不存在（应用没有命令面板）；「手机端列表『…』菜单」也没有通用的列表菜单可挂，改为 Logbook 页顶部按钮，全平台可用。
- 执行后 toast「已把完成的条目移入 Logbook」+「撤销」：撤销把 `loggedThrough` 写回执行前的值。不显示条数（要额外扫一遍全部已了结条目才数得出来）。

### 5. 设置界面

设置 → 通用：「完成的条目移入 Logbook」，分段控件「立即 / 每天 / 手动」，下方一行灰字说明当前选项的含义（手动时提示 `⇧⌘Y`）。

## Out of scope

- 只移入当前视图的条目（水位线方案下只能全局移入）。
- 改动 `engine/src/archive.ts` 的归档规则。

## Open questions

- Deadlines 列表是否也保留 Unlogged Item。Grilling 时没有讨论到；按 `CONTEXT.md` 现有定义（只列未了结条目）实现为不保留，待确认。
- Grouped View 中已完成但未移入的项目不成为组头（`canHostGroup` 不变），它的任务若在同一视图，会落到 Area 组或无组。暂未处理。
