# Quick Add Android Spec

把 Android 状态栏「＋」拉起的原生快速添加浮层（`QuickAddActivity`）从「单行标题」升级为**原生草稿卡片**：可写备注，用 chip 设置计划日期，选择归属和 Tag。保持原生实现（秒开、键盘立刻弹出、进程未起也可用）；截止日期、Reminder 等复杂字段通过「在应用中继续」交给 App 处理。

与桌面端（`.scratch/quick-add-v2`）共用同一个草稿落库函数（第 4 节），规则只有一份。术语见根 `CONTEXT.md`。

## 动机

- 现在只能写标题，任务一律进 Inbox，日期、归属、Tag 都要进 App 再补。
- 冷启动补发只存一条：进程未起时连续添加两条，前一条被覆盖丢失（`PENDING_QUICK_ADD_KEY` 是单个字符串）。
- 落库失败被静默吞掉（`controller.ts` 中的 `.catch(() => undefined)`），用户不知道没加上。

## 1. 卡片形态

```
┌──────────────────────────────────────┐
│ ○ 任务标题                            │
│   备注（点「+ 备注」后展开）            │
│                                      │
│ [今天] [明天] [周末] [Someday] [📅]    │  ← 可横向滑动
│ [📥 收件箱 ▾] [# Tag]                 │
│ [↗ 在应用中继续]  [⟳ 连续]     [添加] │
└──────────────────────────────────────┘
          （键盘）
```

- 沿用现有的顶部悬浮卡片、遮罩和进出场动画；深色模式使用 `values-night` 下的颜色。
- 标题输入改为可多行（最多显示 3 行），但回车即提交；IME 动作仍为 Done。
- 备注默认折叠，点「+ 备注」展开为多行输入，焦点随之移入。
- **日期 chip**（单选，再点一次取消）：
  - 今天、明天、周末（本周六；当天已是周六或周日时取下周六）、Someday；
  - `📅` 打开原生 `DatePickerDialog`，选中后该 chip 显示短日期。
  - 「今天」按**账号时区**计算（来自快照，第 3 节），不用设备时区。
- **归属 chip**：默认「收件箱」，每次打开都重置；点开为底部列表（第 2 节）。
- **Tag chip**：未选时显示「# Tag」；已选时显示 Tag 名称（多个时显示「#工作 +2」）。
- **连续添加**开关：开启后提交不关闭浮层，标题、备注、日期、Tag 清空，归属保留，卡片内短暂提示「已添加」。开关状态记在本机。
- 所有文案（包括 chip 标签）由 JS 按当前语言写入 SharedPreferences，原生端不内置翻译，与现有约定一致。

## 2. 归属 / Tag 选择器

- 原生底部列表：顶部搜索框，下面是列表，覆盖在卡片之上，键盘保持弹出。
- 归属列表的顺序与 `MovePicker` 一致：Inbox，然后各个区域，区域下是其项目；稍后项目（Later Project）不列出。
- Tag 列表按 Tag Group 分组，多选打勾，点「完成」返回卡片。
- 不能新建 Tag 或项目。

## 3. 数据快照（web → 原生）

- 新增插件命令 `plugin:statusbar|setQuickAddData`。JS 在以下时机写入一份精简 JSON：状态栏发布时，以及 Engine 数据变化时（并入现有的 `scheduleStatusBarRefresh` 防抖刷新）。内容包括：
  - Areas、Projects（id、名称、所属区域、顺序，已排除稍后项目）；
  - Tags、Tag Groups（id、名称、颜色、分组、顺序）；
  - 账号时区、`weekStartsOn`；
  - 卡片的全部文案。
- 原生端只负责读取和展示，不做业务推导。归属列表的顺序、Later 过滤都由 JS 算好后写入。
- 进程被杀后，浮层读到的是上一次的快照；落库时再做校验（第 4 节），所以快照过期也安全。
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

- 原生端提交的不再是标题，而是 `QuickAddDraft` 的 JSON：`emitAction("quick-add", json)`。
- JS 侧兼容旧格式：`input` 不是 JSON 时当作纯标题处理（升级过渡期，以及通知上 RemoteInput 的路径）。
- 提交一律进**队列**（SharedPreferences 中的 JSON 数组），由 JS 取走：JS 注册监听后先取一次（冷启动时提交早于 JS 就绪），App 存活时原生发 `quick-add-available` 信号，JS 再取。取出即删，按提交顺序落库。
- 失败时发一条系统通知：标题「未能添加任务」，正文是任务标题，点击打开 App。

## 6. 在应用中继续

- 点击后，先按当前草稿创建任务（与「添加」走同一条通路），然后用 `MainActivity` 的意图打开 App，并带上 `navigate=task:<id>` 一类的目标。
- JS 收到后跳转到任务所在的列表并展开这条任务（`setExpandedId`），用户在展开界面里继续设截止日期、Reminder、子任务等。
- 复用现有的 `takeNavigation` / `onNewIntent` 导航通道，扩展目标格式（现在只有 `today`）。

## 明确不做

- 浮层内设置截止日期、Reminder、Repeat Rule、Subtask（通过「在应用中继续」处理）
- 浮层内新建 Tag / Project
- 自然语言解析（后续在共用层实现，原生端不改）
- App 内底部栏「添加任务」按钮的改造
- 桌面小部件、分享菜单入口

## Issues

- `issues/01-shared-draft-pipeline.md`：共用草稿落库函数、补发队列、失败通知
- `issues/02-data-snapshot.md`：数据快照命令与推送时机
- `issues/03-native-card.md`：原生卡片，包括备注、日期 chip、日期选择器、连续添加
- `issues/04-pickers-and-handoff.md`：归属 / Tag 底部列表、在应用中继续
