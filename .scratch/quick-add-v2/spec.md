# Quick Add V2 Spec

把桌面端 Quick Add 浮窗（`packages/desktop/src/QuickAddApp.tsx`）从「只能输入标题、固定进 Inbox」升级为一张**新任务草稿卡片**：版式与交互对齐展开任务（`TaskRowExpanded`），可在创建前设好备注、计划日期、Reminder、截止日期、Tag 和归属位置。参照 Things 3 的 Quick Entry。术语见根 `CONTEXT.md`。

## 动机

- 现在的 Quick Add 只能写标题。日期、Tag、归属都要事后打开主窗口补，速记的意义打了折扣。
- 浮窗是 `transparent: false` 的直角窗口，`shadow-popover` 实际不可见，视觉上和主应用不是一套。
- 主窗口隐藏时，创建失败只在主窗口弹 toast，用户看不到。

## 1. 卡片形态

```
┌──────────────────────────────────────────────┐
│ ○  任务标题                                   │
│    备注                                       │
│                                              │
│ [📥 收件箱 ▾] [★ 今天] [#工作]     📅 🏷 🚩     │
│                       ↵ 添加 · ⇧⌘↵ 继续 · Esc │
└──────────────────────────────────────────────┘
```

- 窗口透明、无边框，内部画一张圆角卡片（带投影）；macOS 加毛玻璃效果（vibrancy），其他平台用不透明的卡片背景。
- 第一行：空心复选圆圈（只是装饰，不可点）+ 标题输入框。
- 第二行：备注，复用 `MarkdownNotesEditor`，空时显示浅色占位。
- 底栏布局与 `TaskRowExpanded` 相同：已设值的字段在左侧显示为 chip，未设值的字段在右侧显示为图标。点 chip 或图标打开同一个编辑器。
- 底栏最左侧固定显示**归属 chip**（默认「收件箱」），点开是 `MovePicker`。这是展开任务没有的字段。
- 快捷键提示放在底栏最右侧，用弱化色。
- 窗口高度跟内容走：备注变长、chip 换行时调整窗口高度；弹出的选择器不受窗口高度裁切（见 issue 02）。

## 2. 字段

| 字段               | 组件                                   | 写入                                          |
| ------------------ | -------------------------------------- | --------------------------------------------- |
| 标题               | 输入框                                 | `title`（必填，去掉首尾空白后为空时不能提交） |
| 备注               | `MarkdownNotesEditor`                  | `notes`                                       |
| 计划日期 / Someday | `ScheduledDateField`（`showReminder`） | `scheduledType` / `scheduledDate`             |
| Reminder           | 同上                                   | `reminderTime`（见第 3 节）                   |
| 截止日期           | `DueDateField`                         | `dueDate`                                     |
| Tag                | `TagsField`                            | `tagIds`                                      |
| 归属               | `MovePicker`                           | `projectId` / `areaId`（选 Inbox 即两者皆空） |

- 每次打开浮窗，归属默认是 Inbox，与 Things 一致；不记忆上次的选择。
- 不做：Subtask、Repeat Rule、Project Heading。
- Tag 选择器在 Quick Add 里**不提供「新建 Tag」**：新建 Tag 是写操作，必须经主窗口的 Engine 执行，第一期不做。

## 3. 数据通路（沿用事件中继，扩展协议）

Quick Add 窗口不装配 Engine（单一 Engine / Outbox / HLC，见 `quick-add-relay.ts` 与 ADR 0007）。读写都经主窗口代办：

**读：打开时向主窗口要快照**

- 浮窗每次打开时，向主窗口发 `quick-add://snapshot-request`；主窗口从本地副本读取 Projects、Areas、Tags、Tag Groups 以及所需偏好（`weekStartsOn`、账号时区等），回发 `quick-add://snapshot`。
- Quick Add 把快照写入自己的 React Query 缓存，键与 `projectKeys.all`、`tagKeys.all` 等相同，并设 `staleTime: Infinity`。这样字段组件不用改，直接读到数据，也不会回退去调 REST。
- 离线也能用，因为快照来自本地副本。
- 主窗口 1 秒内没有回应时：卡片照常可用，归属和 Tag 选择器显示为空，只能进 Inbox。

**写：提交完整草稿**

- `quick-add://submit` 的 payload 从 `{ title }` 扩展为 `{ draft: QuickAddDraft }`。
- 主窗口调用共用的 `createFromQuickAddDraft(draft)`（定义见 `.scratch/quick-add-android/spec.md` 第 4 节，与 Android 共用）：负责转成 `CreateTaskDto` 并 create，有 `reminderTime` 时再补一次 update，并对已删除的 Tag / 项目做校验和回落。`CreateTaskDto` 不变。
- 兼容旧 payload `{ title }`：版本升级期间，主窗口和浮窗可能来自不同构建，所以主窗口要同时接受两种格式。

**结果回执**

- 主窗口创建完成后回发 `quick-add://result`（`{ ok, taskId?, error? }`）。
- 失败时用系统通知提示，因为两个窗口此时都可能不可见。现有的主窗口 toast 保留。

## 4. 键盘

| 动作                                     | macOS                           | Windows            |
| ---------------------------------------- | ------------------------------- | ------------------ |
| 添加并关闭                               | ↵（标题框内）/ ⌘↵（任意位置）   | Enter / Ctrl+Enter |
| 添加并继续（不关窗、清空草稿、归属保留） | ⇧⌘↵                             | Ctrl+Shift+Enter   |
| 标题 → 备注                              | ↓ 或 Tab                        | 同左               |
| 打开计划日期（When）                     | ⌘S                              | Ctrl+S             |
| 设为今天 / Someday                       | ⌘T / ⌘O                         | Ctrl+T / Ctrl+O    |
| 打开截止日期                             | ⇧⌘D                             | Ctrl+Shift+D       |
| 打开 Tag                                 | ⇧⌘T                             | Ctrl+Shift+T       |
| 打开归属（移动）                         | ⇧⌘M                             | Ctrl+Shift+M       |
| 关闭选择器 / 放弃草稿并关窗              | Esc（有选择器开着时先关选择器） | 同左               |

- 字段快捷键与主应用 keymap 保持一致（`docs/keyboard-shortcuts.md`），不新造键位。
- 输入法组字中（`isComposing`）的 Enter 不提交。
- 失焦隐藏的行为不变；草稿在隐藏后保留，Esc 才清空。

## 5. 反馈

- 提交后，卡片播放约 150ms 的勾选加淡出动画，然后隐藏窗口。
- 「添加并继续」时不隐藏窗口：标题框下方短暂显示「已添加到 X」，然后焦点回到空的标题框。

## 明确不做（后续另起 spec）

- 自然语言日期解析与行内语法（`明天`、`#tag`、`@项目`）
- 粘贴多行批量创建
- 默认归属跟随主窗口当前视图
- Android 状态栏 Quick Add（另见 `.scratch/quick-add-android`）
- Quick Add 内新建 Tag / Project

## Issues

- `issues/01-relay-protocol.md`：中继协议，包括快照、完整草稿提交、结果回执
- `issues/02-window-shell.md`：透明圆角窗口、动态高度、进出场动画
- `issues/03-draft-card.md`：草稿卡片与字段栏，复用展开任务的字段组件
- `issues/04-keyboard-and-feedback.md`：键盘、添加并继续、提交反馈
