# Quick Add Android Spec

把 Android 状态栏「＋」拉起的快速添加浮层（`QuickAddActivity`）从「单行标题」升级为草稿卡片：可写备注，设置计划日期、截止日期，选择归属和 Tag。卡片与桌面共用 `QuickAddCard`（ADR-0020）；子任务、重复规则等通过「在应用中继续」交给 App 处理。

与桌面端（`.scratch/quick-add-v2`）共用同一个草稿落库函数（第 4 节），规则只有一份。术语见根 `CONTEXT.md`。

## 动机

- 现在只能写标题，任务一律进 Inbox，日期、归属、Tag 都要进 App 再补。
- 冷启动补发只存一条：进程未起时连续添加两条，前一条被覆盖丢失（`PENDING_QUICK_ADD_KEY` 是单个字符串）。
- 落库失败被静默吞掉（`controller.ts` 中的 `.catch(() => undefined)`），用户不知道没加上。

## 1. 卡片形态

> 更新（ADR-0020）：原生卡片已废弃。浮层仍是原生透明 Activity（遮罩、进出场动画、独立 task），卡片改为透明 WebView 里与桌面 quick-add 窗口、展开任务**同一张 `QuickAddCard`**（`packages/mobile/src/quick-add`）。下文按新实现描述。

```
┌──────────────────────────────────────────┐
│ ○ 任务标题                                │
│   备注                                    │
│   [收件箱] [★ 今天] [工作]    (📅)(#)(⚑)  │  ← 字段栏，同桌面 / 展开任务
│   [↗ 在应用中继续]     [⟳ 连续添加] [添加] │  ← 触屏操作行（替代快捷键提示行）
└──────────────────────────────────────────┘
          （键盘）
```

- 字段、选择器、草稿映射全部来自 `QuickAddCard`：归属（`MovePicker`）、计划日期（含 Reminder）、Tag、截止日期；窄屏选择器为居中卡片（与 App 内展开任务一致）。
- 触屏没有快捷键：`QuickAddCard` 的 `footer` 换成按钮行——在应用中继续、连续添加开关、添加。连续添加开启时，回车与「添加」都是「添加并继续」：标题、备注、日期、Tag 清空，归属保留，提示「已添加」。开关状态记在浮层 WebView 的 localStorage。
- 点遮罩、页面空白处或返回键关闭；有选择器开着时先关选择器。

## 2. 选择器

- 与 App 内完全相同（`MovePicker` / `TagPicker` / `ScheduledDateField` / `DueDateField`），不能新建 Tag 或项目（`allowCreate={false}`）。

## 3. 数据快照（web → 原生 → 浮层页面）

- 插件命令 `plugin:statusbar|setQuickAddData`，JS 在状态栏发布时与 Engine 数据变化时（并入 `scheduleStatusBarRefresh` 防抖刷新）写入 v2 快照（`quick-add-snapshot.ts`）：
  - Projects、Areas、Tags 的完整 DTO；
  - 账号时区、`weekStartsOn`、语言、主题设置。
- 浮层页面经宿主桥 `getSnapshot` 读出，按查询键写进 React Query 缓存（同桌面 quick-add 窗口），字段组件零改动。主题为「跟随系统」时按原生报告的系统深浅色解析。
- 进程被杀后，浮层读到的是上一次的快照；落库时再做校验（第 4 节），所以快照过期也安全。版本不符（如旧版 v1）当作没有快照：只能进 Inbox。
- 登出时 `cancel` 已经会清空 SharedPreferences，快照随之清除。

## 4. 共用草稿落库（与桌面共用）

在 `packages/api` 新增 `QuickAddDraft` 类型和 `createFromQuickAddDraft(draft)`：

```ts
interface QuickAddDraft {
  title: string;
  notes?: string;
  when?: { type: 'date'; date: string } | { type: 'someday' }; // date 为日历日 YYYY-MM-DD
  reminderTime?: string; // HH:mm，仅 when.type === 'date' 时有效
  dueDate?: string;
  projectId?: string;
  areaId?: string;
  tagIds?: string[];
}
```

- 负责把草稿转成 `CreateTaskDto` 并调用 `currentTaskBackend().createTask`；有 `reminderTime` 时再补一次 update。
- **校验**：已删除或进了回收站的 Tag 直接丢弃；归属的项目或区域不存在时回落到 Inbox；标题去掉首尾空白后为空时不落库。
- 返回 `{ taskId, placedIn }`，`placedIn` 是实际落入的位置，用于「已添加到 X」的提示和「在应用中继续」的跳转。
- 桌面端中继（`quick-add-v2` issue 01）和 Android 状态栏控制器都调用它。
- 以后的自然语言日期解析也放在这一层，原生端只送原始文本。

## 5. 提交通路

- 浮层提交的不再是标题，而是 `QuickAddDraft` 的 JSON（页面经宿主桥 `submit` 交给原生入队）。
- JS 侧兼容旧格式：`input` 不是 JSON 时当作纯标题处理（升级过渡期，以及通知上 RemoteInput 的路径）。
- 提交一律进**队列**（SharedPreferences 中的 JSON 数组），由 JS 取走：JS 注册监听后先取一次（冷启动时提交早于 JS 就绪），App 存活时原生发 `quick-add-available` 信号，JS 再取。取出即删，按提交顺序落库。
- 失败时发一条系统通知：标题「未能添加任务」，正文是任务标题，点击打开 App。

## 6. 在应用中继续

- 点击后，先按当前草稿创建任务（与「添加」走同一条通路），然后用 `MainActivity` 的意图打开 App，并带上 `navigate=task:<id>` 一类的目标。
- JS 收到后跳转到任务所在的列表并展开这条任务（`setExpandedId`），用户在展开界面里继续设截止日期、Reminder、子任务等。
- 复用现有的 `takeNavigation` / `onNewIntent` 导航通道，扩展目标格式（现在只有 `today`）。

## 明确不做

- 浮层内设置 Repeat Rule、Subtask（通过「在应用中继续」处理）
- 浮层内新建 Tag / Project
- 自然语言解析（后续在共用层实现）
- App 内底部栏「添加任务」按钮的改造
- 桌面小部件、分享菜单入口

## Issues

- `issues/01-shared-draft-pipeline.md`：共用草稿落库函数、补发队列、失败通知
- `issues/02-data-snapshot.md`：数据快照命令与推送时机
- `issues/03-native-card.md`：原生卡片，包括备注、日期 chip、日期选择器、连续添加（已被 ADR-0020 的 WebView 卡片取代）
- `issues/04-pickers-and-handoff.md`：归属 / Tag 底部列表、在应用中继续（选择器部分同上被取代）
