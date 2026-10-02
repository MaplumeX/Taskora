# 03：原生卡片（备注、日期 chip、日期选择器、连续添加）

Status: implemented — awaiting device verification (Kotlin not compiled)
Blocked by: 01, 02

## Problem

浮层只有一个单行输入框。需要扩展为可以写备注、设计划日期的草稿卡片，同时保持秒开和键盘立刻弹出。

## Design

见 spec 第 1 节。

- `activity_quick_add.xml`：
  - 标题框改为多行（`maxLines=3`，IME 动作仍为 Done）；
  - 新增可折叠的备注框；
  - 新增日期 chip 行（`HorizontalScrollView`）和底部操作行（在应用中继续、连续添加、添加）。
  - 归属和 Tag chip 在本 issue 里先放占位，交互在 04 实现。
- chip 风格：圆角胶囊，选中时用强调色作底；颜色在 `colors.xml` 和 `values-night/colors.xml` 中各定义一套，与 App 的 Things 风格保持一致。
- 日期计算（今天、明天、周末）用快照里的账号时区（`java.time`，`ZoneId`）。`📅` 打开 `DatePickerDialog`，一周的起始日取快照里的 `weekStartsOn`。
- 提交：组装 `QuickAddDraft` JSON，走 01 的通路。
- 连续添加：开关状态存在 SharedPreferences；开启时提交后清空字段、保留归属、焦点回到标题框、显示「已添加」提示。
- 提交时给一次轻触觉反馈（`HapticFeedbackConstants.CONFIRM`，30 以下的系统版本用 `VIRTUAL_KEY`）。

## Acceptance

- 冷启动和热启动下，浮层弹出的速度和键盘弹出的时机与改造前一致。
- 选「明天」后提交，任务出现在 Upcoming 中正确的日期下；选 Someday 后提交，任务进入 Someday。
- 连续添加 3 条后关闭浮层，3 条都在。
- 深色模式下颜色正常。

## Comments

### 2026-10-02：实现

- 新增 `QuickAddData.kt`：解析快照；没有快照、版本不认识或内容损坏时，退回只有 Inbox 的空数据，文案用英文兜底。
- 新增 `QuickAddDates.kt`：minSdk 24 没有 `java.time`，改用 `Calendar` 加快照里的账号时区。「周末」取本周六；今天是周六时取 7 天后，是周日时取 6 天后的周六。
- `activity_quick_add.xml` 重写：装饰复选框加标题（`setHorizontallyScrolling(false)` 加 `maxLines=3`，显示上能折行，输入法仍显示「完成」）、「+ 备注」展开、日期 chip 行、归属 / Tag chip 行、底部操作行（在应用中继续 · 连续添加 · 已添加提示 · 添加）。
- chip 由代码生成，背景是 `bg_quick_add_chip`（选中时强调色底，未选描边）；浅色和深色的颜色都放在 `colors.xml` / `values-night`。
- 日期 chip 单选，再点一次取消；📅 打开 `DatePickerDialog`，周起始日取快照里的设置，选中后 chip 显示短日期。
- 连续添加：开关状态存本机；提交后清空标题、备注、日期、Tag，保留归属，显示「已添加」约 1.2 秒。提交时有触觉反馈（30 以上用 CONFIRM，以下用 VIRTUAL_KEY）。
- 标题为空时点「添加」等同关闭。
- **未编译**：本机没有 Android SDK。已人工核对 API 级别（`getColor`、`DatePicker.firstDayOfWeek` 等都在 minSdk 24 以内）。
