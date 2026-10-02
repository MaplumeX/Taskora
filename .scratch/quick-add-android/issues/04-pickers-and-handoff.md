# 04：归属 / Tag 选择器，在应用中继续

Status: implemented — awaiting device verification (Kotlin not compiled)
Blocked by: 03

## Problem

卡片里还不能选择归属和 Tag；截止日期、Reminder 这些浮层里不做的字段，需要一个去 App 继续编辑的出口。

## Design

见 spec 第 2、6 节。

- 选择器：在 `QuickAddActivity` 内部叠一层底部列表，不另开 Activity，避免触发系统过渡动画、键盘被收起。
  - 顶部搜索框，按名称过滤（不区分大小写）。
  - 归属列表单选，选中即返回卡片；Tag 列表多选，点「完成」返回。
  - 数据和顺序直接使用快照中的行列表。
- 归属 chip 显示图标和名称（收件箱、区域、项目）；Tag chip 规则见 spec。
- 在应用中继续：
  - 先按当前草稿提交（走 01 的通路，需要拿到新任务的 id）。热路径上 JS 落库后通过插件回传 `taskId`；冷路径上进程还没起来，改为把草稿和「需要跳转」的标记一起入队，由 JS 落库后自行导航。
  - 用 `MainActivity` 的意图打开 App，`EXTRA_NAVIGATE` 扩展为 `task:<id>`（或在冷路径上由队列条目携带）。
  - JS 侧：`takeStatusBarNavigation` / `onStatusBarNavigate` 识别 `task:` 前缀，跳转到任务所在列表，并对这条任务调用 `setExpandedId`。
  - 浮层直接关闭，不播放退出动画，避免和 App 的启动动画叠在一起。

## Acceptance

- 在项目 A 里选 Tag「工作」和「紧急」后提交，任务出现在 A 中，带这两个 Tag。
- 冷启动和热启动下，点「在应用中继续」都能打开 App 并展开这条新任务。
- 搜索框支持中文过滤。

## Comments

### 2026-10-02：实现

- **偏离 spec**：选择器做成**卡片内的面板**，打开时替换掉字段区；没有在卡片上方再叠一层底部列表。原因是键盘始终弹着，叠层要处理遮挡和输入法焦点，卡片内面板更简单可靠。面板由搜索框、可滚动列表（220dp）和「完成」（仅 Tag 选择器）组成；返回键或点遮罩时先关面板。
- 归属：单选，选中即返回；无搜索词时按 `depth` 缩进，有搜索词时结果扁平显示；区域名加粗。chip 显示「📥 收件箱 / ▦ 区域 / ◔ 项目 ▾」（用字符代替图标，没有新增图标资源）。
- Tag：多选，打勾；无搜索词时显示分组小标题，组内没有命中项时不显示该小标题；每行带颜色圆点。chip 显示「#工作 +2」。
- 搜索：标题包含即命中，不区分大小写（`Locale.ROOT`），中文可用。
- **在应用中继续（实现方式比 spec 简单）**：原生只是把草稿带上 `openInApp: true` 入队，然后拉起 App、不播出场动画就关闭浮层。JS 取走队列后，控制器调用 `createDraft`，看到 `openInApp` 就用新任务 id 调用 `revealTask`；mobile 端把它接到现成的 `requestTaskReveal`（提醒通知打开任务也是用它），由 AppShell 跳转到任务所在列表并展开。冷启动和热启动走同一条路，原生不需要等任务 id 回传，也没有扩展 `EXTRA_NAVIGATE`。
- JS：`draft.ts` 新增 `quickAddOpensInApp`；控制器的 `createDraft` 改为返回 `{ taskId } | null`，新增可选的 `revealTask`。
- 测试：`draft.test.ts` 新增 `quickAddOpensInApp`；`controller.test.ts` 新增「openInApp 时定位到新任务、普通提交不定位」。
- **未编译、未上真机**：需要验证冷启动和热启动下「在应用中继续」都能展开新任务，以及选择器面板与键盘的配合。
