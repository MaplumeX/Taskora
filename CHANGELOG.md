# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

> **注**：自 v0.3.0 起桌面端与仓库其余包统一版本号、随 `v*` tag 同步发版；
> 移动端（Android）自首个版本起即纳入同一单轨。CHANGELOG 不单设 Desktop /
> Android 小节，端专属改动标注 `(desktop)` / `(android)`。
> 此前的 `## Desktop [x.y.z]` 小节是双轨制时期的历史记录。

## [0.9.0] - 2026-10-10

### Added

- **engine/shared/api/backend/ui/mobile**: Logging Mode：自选已了结条目进入 Logbook 的时机 (#202) —
  此前条目一了结就立刻离开所属视图，现在对齐 Things 3 提供 **Immediately**（默认，行为不变）、**Daily**
  与 **Manually** 三种记账模式，已了结条目可以划着横线留在原处成为 **Unlogged Item**，直到被记入
  Logbook。是否已记账是**推导**结果、绝不存到 Task / Project 上：由账号偏好 `loggingMode` 与可空的 ISO
  水位 `loggedThrough` 决定，规则落在 `engine/src/domain/logging.ts` 的 `settledIsLogged` /
  `keepsSettledInViews`，经 `ViewContext.logging` 贯穿 `taskMatchesView`、`projectMatchesView`、
  `taskMatchesQuery` 与 `planTaskSearch`，设备引擎与 hub 共用；缺省 `logging` 即 Immediately，旧调用方
  行为不变。条目按各自的了结时刻判断，因此了结一个项目会连同其未了结任务一起了结，而早已了结的任务
  不会被拉回视图。**Log Completed** 把水位推进到当下——任意条数都是 O(1) 的一次偏好写入——并支持撤销；
  入口有 `⇧⌘Y`（Windows `Ctrl+Shift+Y`、Web `Alt+Shift+Y`，可在 keymap 重绑）、任务与项目右键菜单，
  以及手机端 Logbook 页按钮，Immediately 模式下全部隐藏，操作后有带 **Undo** 的 toast。
  `UserPreferences` / `UpdatePreferencesDto` 增这两个字段并由后端 DTO 用 `IsIn` / `IsISO8601` 校验，
  `normalizePreferences` 改为 payload 权威（LWW、`null` 也是值、接受更早水位以支持撤销回退）；新增
  `useLogging`（`useLoggingActions` / `useLoggingMode` / `useIsLogged`，乐观写入失败回滚）与按模式 + 水位
  取键的 `useCalendarQueryRefresh`。非 Logbook 视图中未记账的已了结条目留在原处划横线，项目的「已了结」
  面板只取已记账条目，勾选未记账条目即重开（取消的则取消取消），侧边栏 / 首页徽章与 Android 状态栏
  通知计数只数未了结条目，New in Today 排除已了结条目，项目进度仍计入它们；快速查找 / 搜索把
  Unlogged Item 当普通结果返回；设置 → 通用新增分段控件与说明（Manually 显示当前快捷键），
  `useCompletionRhythm` 在非 Immediately 模式下勾选立即提交、行不消失（不 hold、不收起、不预览）。
  `CONTEXT.md` 新增 Logging Mode / Unlogged Item / Log Completed 词条，机制见 ADR-0022。

- **engine/api/backend/shared/ui/frontend/desktop/mobile**: Quick Find 隐藏列表与项目分组标题搜索 (#203) —
  对齐 Things 3（3.11+）：快速查找除既有的 Deadlines 外，新增只能从快速查找进入的隐藏列表
  **Tomorrow**（Upcoming 中计划在明天的条目）、**Repeating**（全部带重复规则的未了结条目，按下次发生
  排序）、**All Projects**（全部未了结项目，按区域分节）与 **Logged Projects**（Logbook 中的项目，按了结
  日期分组）；输入项目分组标题名称会跳到其所属项目、选中该标题行并滚入视野。这些隐藏列表与 Deadlines
  一致：无侧边栏入口、无计数、无手机首页入口、不可固定，出现在快速查找的「列表」组与 ⇧⌘O 前往弹层
  （共享列表目标），按本地化与英文名匹配，到处都排除 Archived Logbook。engine 新增 `repeating` 视图与
  `ViewFields.repeatRule`，日序视图统一进 `DAY_SORTED_VIEWS`（Deadlines → `dueDate`，Repeating →
  `scheduledDate`），`viewNeedsCalendar` 覆盖 `repeating`；设备引擎补 `repeating` 粗筛、`repeatRule` 经
  `queryFieldsOf` 透传，并新增 `ProjectHeadingBackend.getActiveHeadings()`；后端 `TaskView` / `ProjectView`
  粗筛与 feed DTO 校验跟进，新增 `GET /project-headings/active`（`ProjectHeadingsService.findActive`）；
  shared 的 `FeedView` 扩展 `repeating`。UI 侧从 Deadlines 抽出共享的 `FlatFeedPage` 供 Repeating 复用，
  新增 `Tomorrow`、`AllProjects`（含纯函数 `allProjectSections`）与 `LoggedProjects` 页面，`navItems` 的
  `hiddenListNavs` 同时喂给快速查找的 `LIST_TARGETS` 与 `PageHeading`，`quickFindResults` 新增 `headings`
  组（位于地点与标签之间，`#tag` chip 激活时隐藏，候选仅限本身是导航目标的项目、按侧边栏顺序排序），
  新增 `useActiveHeadingsQuery` hook 与 `ProjectHeadingRow` 的 `revealId` 处理；三端补路由与懒加载，
  i18n 补名称 / 分组 / 空状态，`CONTEXT.md` 新增 Hidden List、Tomorrow、Repeating、All Projects、
  Logged Projects 词条。

- **backend/api/shared/ui**: 可订阅的外部日历（ICS） (#204) —
  粘贴 iCal（ICS）链接即可把外部日历的事件只读地显示在 **Today**、**Upcoming**（日分组与月分组）与
  **Calendar**（月网格与日详情）的任务旁边，让一天可以围绕会议来安排：Google / Outlook / iCloud 等都能
  直接给出 iCal 链接，无需 OAuth、CalDAV 或读取设备日历。设置 → 日历可粘贴链接（`https://`、`http://`
  或 `webcal://`）、重命名、从 8 色调色板选色、临时停用或删除；名称默认取日历自身的 `X-WR-CALNAME`，
  否则取主机名，抓取失败会在设置里给出原因（链接错误、地址被拦截、超时、HTTP 状态、文件过大、不是
  iCal 文件）。**抓取与解析在 hub 而非设备**：浏览器无法跨域读取 Google / Outlook 的 ICS，因此后端用
  `ical.js` 下载 feed、按订阅缓存解析结果 15 分钟，并按需经 `GET /calendar/events?from&to` 展开重复
  （账号时区的日期键、闭区间、最多 100 天）；重新抓取失败时继续提供过期副本并把错误记在订阅上。订阅是
  **普通 REST 资源而非同步实体**（`/calendar/subscriptions`），不走 Change Event、不进 Local Replica
  ——URL 是秘密，没理由躺在每台设备的 SQLite 里；事件是像 Repeat Preview 一样的投影：无复选框、不可
  拖拽 / 编辑、不进 Selection，标签筛选激活时隐藏。线格式：全天事件带日期键（`end` 独占），定时事件带
  UTC 时刻，由客户端把定时事件分配到它在账号时区覆盖的每一天（正好结束于午夜的事件不外溢）；时区上
  文件内的 VTIMEZONE 定义优先，无定义的 IANA TZID 按该时区解析（含 DST），浮动时间用账号时区，
  `STATUS:CANCELLED` 的事件与实例一律丢弃。SSRF 防护：只接受 http(s)（`webcal://` 视作 `https://`），
  每个解析出的地址在 socket 的 `lookup` 内检查（DNS rebinding 无法绕过），回环 / 私有 / 链路本地 /
  CGNAT / 组播网段一律拒绝，IP 字面量直接检查，重定向手动跟随（最多 5 跳、每跳重检），15 秒超时、
  10 MB 体积上限，内网日历的自建者可设 `CALENDAR_ALLOW_PRIVATE_NETWORK=true`；订阅只在一次成功的抓取
  与解析之后才创建，坏链接当场报错而不是日后悄无声息地失败。迁移 `20261010120000_calendar_subscriptions`
  新增 `CalendarSubscription` 表，决策见 ADR-0023。

- **ui**: Expanded Linger：展开中的任务被编辑到视图外时留在原位 (#205) —
  对齐 Things 3：当前展开（打开）的任务被编辑到不再属于当前视图时（例如把 Inbox 任务设为 Today、或把
  Upcoming 任务改成 Someday），该行留在原来的位置与分组里，直到被收起；数据立即写入，推迟的只是这一行
  从列表里的移除，且该行继续渲染最新数据。任务仍在列表里、只是会移到另一个分组时（例如在 Upcoming 改成
  另一个未来日期）同样留在原日期直到收起；同组内的排序变化仍照常跟随数据。任务进 Trash、已不存在、或
  已出现在同一页面的另一个列表时不 linger（例如 Search 把任务从「任务」区移到「Logbook」）；只有展开的
  行 linger，未展开的行立即离开。这是渲染层行为，不改写数据。新增
  `packages/ui/src/lib/useLingeringExpanded.ts`：记住条目离开前的形态、前一个兄弟节点与索引，并把它重新
  插回原位（前一个兄弟之后，若该行已不在则用原索引）；`stays` 谓词把「仍在但换了分组」也当作离开
  （Upcoming 用它处理日期变化），`unlessShownElsewhere` 在任务已出现在同页另一个 Selection 作用域时跳过
  linger（调用方须登记未 linger 的行，以免 linger 行把自己算进去），并经 `useTaskQuery` 检测 Trash /
  缺失。`GroupedFeedListView`（覆盖 Inbox 与平铺时间视图）、`ProjectTaskLayout` 与 `TaskListView`（用
  `unlessShownElsewhere`，Selection 作用域仍按未 linger 的行登记）、`Upcoming`（`sameScheduledDate` 的
  `stays`，排在 `useHeldValue` 之前，使 linger 先于落位后的 hold 逻辑）接入。`CONTEXT.md` 新增
  Expanded Linger 词条。

- **api/ui/desktop**: Things 风格日期、排序、导航与剪贴板快捷键 (#200) —
  补齐 `docs/keyboard-shortcuts.md` 中记为 P1/P2 的键位，更贴近 Things：日期编辑（When 卡片 `⌘S`，
  Today / Anytime / Someday `⌘T` / `⌘R` / `⌘O`，计划日期前后挪 `⌃[` / `⌃]`、`⌃⇧[` / `⌃⇧]`，截止日期卡片
  `⇧⌘D`，截止日期前后挪 `⌃,` / `⌃.`、`⌃⇧,` / `⌃⇧.`，重复规则 `⇧⌘R`）、移动与排序（移动到另一个列表
  `⇧⌘M`，上 / 下 / 顶 / 底 `⌘↑` / `⌘↓` / `⌥⌘↑` / `⌥⌘↓`）、导航（上一个 / 下一个侧边栏列表 `⌃⌥⌘↑` /
  `↓`，打开选中项目 / 区域 `⌘→`，Show in Parent `⌘L`，导航弹层 `⇧⌘O`，切换侧边栏 `⌘/`）、选择与新建
  （扩展到顶 / 底 `⌥⇧↑` / `↓`，从选中项新建分组标题 `⌥⇧⌘N`，在打开的任务里新建子步骤 `⇧⌘C`）以及剪贴板
  （复制 `⌘C`、粘贴 `⌘V`、把复制的内容移到这里 `⌥⌘V`）；标点组合键按物理键解析，因此 `⌃⇧]` → `}` 等带
  shift 的变体也能正确映射。新增 `NavigationPopover.tsx`（⇧⌘O 快速切换内置列表、区域与项目，按名称英中
  过滤、前缀匹配优先）、`KeyboardFieldPicker.tsx`（把旧的 `KeyboardTagPicker` 泛化为标签 / 计划 / 截止 /
  重复 / 移动卡片，锚定在最后选中的行上）、`keyboardEdits.ts`（纯计划 / 截止日期步进与 `⌘L` 的父级路由
  解析）、`itemClipboard.ts`（内存中的已复制条目加系统文本识别、外部文本转任务标题、页面放置目标与载荷）
  与 `systemClipboard.ts`（桌面走原生 `tauri-plugin-clipboard-manager`，Web 走 `navigator.clipboard`）。
  `SelectionRow` 现在携带 `item` 快照与 `sortGroup`，作用域可注册 `reorder` 与 `headingFromSelection`
  动作，新增 `reorderedRowIds` 把多选作为一个整体在同一 `sortGroup` 内移动、分组标题与其他组原位不动。
  项目页接入组内排序与从选中任务新建分组标题，分组 feed、Upcoming（按天）与任务列表的排序与拖拽走同一条
  写回路径。桌面端新增 clipboard-manager 插件与读写文本能力，绕过 WKWebView 的跨应用粘贴确认。Web 上被
  浏览器占用的组合键改绑：`Ctrl+L` → `Alt+L`、`Ctrl+Shift+O` → `Alt+Shift+O`、`Ctrl+Shift+C` →
  `Alt+Shift+C`、重复 → `Alt+Shift+P`（`Alt+Shift+R` 仍属回顾模式）。`docs/keyboard-shortcuts.md` 的
  P1/P2 小节改写为真正的 Dates / Move / Global 小节并新增 Clipboard 小节，i18n 补英中文案。

### Changed

- **ui**: Upcoming 月分组按计划日期排序，禁止月内跨日重排 (#206) —
  Upcoming 的月分组不再按 feed 的 `Position` 渲染，而按计划日期排序，同一天的任务保持 feed 顺序：
  `upcomingGroups` 不再接收 `items`，直接从布局的日桶（`month.days.flatMap((day) => day.items)`）派生
  月条目，使顺序跟随计划日期而不是按 key 过滤 feed 数组。`moveUpcomingTask` 对 `month:` 分组内的跨日移动
  返回 `null`（锚点与被拖条目落在不同天）：同日内拖拽仍可用并经 `reorder` 持久化，跨日拖拽既不写日期也
  不存顺序，刷新前后都保持按日期排序；跨组拖拽不变，仍由落点所属的月 / 周标题提供新日期，行随后按日期
  显示。此前月分组沿用 feed 的手动 `Position`，可能把较晚的日期排到较早的日期之上，让可见顺序与行上的
  日期相互矛盾，月内跨日拖拽还可能产生刷新后无法复现的顺序。

### Fixed

- **ui**: 底部栏切换动画不再撑高桌面窗口 (#201) —
  桌面窗口此前会整体滚动：底部栏与侧边栏跟着页面一起移动。`ContentBottomBar` 里的两组按钮通过透明度与
  位移交叉淡入淡出，隐藏的一组留在 DOM 中且 `translate-y-1.5` 使其下移 6px，而栏位于窗口底部又未裁剪
  溢出，于是不可见的按钮把文档滚动高度撑高了 6px。修复为给底部栏加 `overflow-hidden`，让按钮切换动画
  裁在栏内；同时隐藏主内容区的滚动条（`[scrollbar-width:none]` / `[&::-webkit-scrollbar]:hidden`）并
  去掉已不需要的 `[scrollbar-gutter:stable]`，列表增长或跨组拖拽不再改变任务行宽度。列表仍在
  `MainContent` 内独立滚动，菜单与提示仍走 portal。在 Chromium 中以项目生成的 Tailwind CSS 与相同布局
  实测：窗口高 800px、标题栏 0px（Web / 全屏）/ 28px（macOS）/ 32px（Windows / Linux）各变体下，文档
  滚动高度由修复前的 806px 降为 800px，1800px 高的任务内容仍在主内容区独立滚动，底部栏下缘保持在
  800px。

## [0.8.1] - 2026-10-09

### Added

- **engine/api/backend/shared/ui/desktop/mobile**: 复制任务与项目（⌘D）(#185) — 任务与项目支持
  「复制」，把内容原样抄进一个新的独立条目：标题、备注、计划与截止日期、提醒、重复规则、归属与
  标签全部保留，复制项目还连同其项目分组标题、未进 Trash 的任务、子任务与附件（附件指向同一个
  Blob，遵循 ADR 0019）。副本一律重置为未完成（与 Repeat Project Instance 同规则）、不记来源
  （`repeatSourceId` 为 null），紧挨源条目之后落位（任务在列表里、项目在侧边栏里），日期不平移。
  纯函数落在 engine 的 `planTaskDuplicate` / `planProjectDuplicate`，hub 与设备引擎两个后端共用；
  `planRepeatProjectInstance` 里的项目内容复制抽成可复用的 `copyProjectContents`，重复项目派生与
  复制共用（复制时 `delta = 0`）。REST 侧新增 `POST /tasks/:id/duplicate` 与
  `POST /projects/:id/duplicate`，经同步 hub 在单个事务里写入；`TaskBackend` / `ProjectBackend`
  接口、REST 与 engine 两个 API client 及对应 React Query hooks（`useDuplicateTask` /
  `useDuplicateProject`）一并跟进。UI 上 `useDuplicate` 按显示顺序逐个复制、副本落在各自源条目
  之后、完成后选中副本；⌘D / Ctrl+D（Web 的 Ctrl+D 可拦截，行为与桌面一致）在选中的任务与项目行
  生效，忽略分组标题与项目分组标题，Trash 中不生效，多选时按显示顺序整组复制。入口有任务右键
  菜单、项目右键菜单、项目页「…」菜单（回顾模式中改为 toast 提示）与触控端多选工具栏的「更多」
  面板（执行后退出多选）。`CONTEXT.md` 新增 Duplicate 词条与 `_Avoid_` 列表，
  `docs/keyboard-shortcuts.md` 补上键位并删掉「复制任务 — 无 duplicate API」的缺口行。

- **ui**: 展开任务的上下文工具栏 (#188) — 任务行展开时，底部栏从默认的路由动作（添加 / 搜索 /
  助手）切换为作用于该任务的 **移动 / 删除 / 更多**（对齐 Things 3），收起后恢复原先的一栏。
  `ExpandedTaskToolbar` 有两个变体：桌面内联在 `ContentBottomBar` 里（字段选择器走 Popover），
  手机是替换 FAB 的浮动胶囊（ActionSheet + FieldPickerDialog）。「更多」菜单含重复、跳过本次、
  复制与转换为项目；Trash 中的任务「删除」变为「放回」。工具栏保留最后一次渲染的任务，按钮随原
  文案淡出而不是瞬间变空；`ContentBottomBar` 经 `BarLayer` 在默认动作与工具栏之间交叉淡入淡出，
  隐藏层淡出下沉并退出交互（`aria-hidden` + `inert`），`MobileFab` 同时收缩淡出让位。指针落在
  工具栏内不再算作行外点击，展开状态因此保持；点别处仍照常收起。

- **ui/api/desktop/frontend**: 跨端导航预加载 (#192) — 页面模块与数据在用户点进去之前先备好：
  预加载与首次渲染共用同一个模块加载器，预热过的页面打开时不再二次 import，预加载本身从不挂载
  组件。空闲时逐路由预热，且只在当前页面代码提交、live query 与同步都已落定之后开始，首屏始终
  优先；桌面按常用页序预热（日历、回顾、Logbook、设置与助手在后），Web 只预热主要目的地，并在
  离线、save-data、2G/3G 与已知慢连接下跳过投机下载。指针在导航项上停留 100ms 或该行获得键盘
  焦点即准备路由，快速划过则取消；悬停在项目上还会预取其本地任务、分组标题与已了结行。live query
  预取复用页面自己的 query 定义与 Engine watches：并发读去重、副本变化照旧刷新、投机 watch 在
  30s 后停止但结果留在既有的 5 分钟 GC 内；切换账号或退出会清空全部 query 与计时器，REST 回退
  模式不发额外项目请求。Web 上的后台模块加载失败静默结束并清掉失败的 promise，真实导航仍走既有
  的 chunk recovery；窗口隐藏时暂停预加载，离开 shell 则取消待办。

- **ui/api/shared/backend**: New in Today 确认横幅与单条已读 (#197) — 对齐 Things 3：新到条目不再
  自成一区，留在原有排序位置与分组里、仅行首带黄点；Today 日期下方、标签筛选与列表之上新增黄色
  横幅「你有 X 个新的待办事项」，最右是「好」按钮，X 为全部未读新到条目数（任务与独立项目行）、
  不受标签筛选影响，为 0 时整条隐藏。「好」一次清掉全部黄点并把已确认日期推进到今天；单条交互也
  算已读——展开 / 打开详情、编辑任一字段、拖拽排序都会清掉该条黄点（单击选中、多选与悬停不算），
  逐条读完等同整体确认。账号偏好语义随之调整：`todayReviewedOn` 改为「已确认日期」（只在确认或
  全部读完时推进、只进不退、跨端同步），进入 / 离开 Today 不再推进，从未确认过时只在首次进入
  建立基线；新增 `todaySeenKeys` 存单条已读键 `task:<id>@<计划日期>` /
  `project:<id>@<计划日期>`（改期后再次随日期到来会重新算新到），跨设备按并集合并、被确认日期
  覆盖后清理，shared 侧补 `TODAY_SEEN_KEY_PATTERN` / `TODAY_SEEN_KEYS_MAX` /
  `mergeTodaySeenKeys` 与后端 DTO 校验。`GroupedFeedListView` 的 `FRESH` 容器、新到区置顶与
  「仅可区内重排」的拖拽限制整体移除，黄点改为纯由新到键集合驱动（含项目分组标题）；`CONTEXT.md`
  的 New in Today 与 Review 词条同步改写。

- **engine/api/backend/shared/ui**: 截止日期对齐 Things 3：Today、Deadlines 列表与重复实例
  (#199) — 截止日期此前只影响行的显示（旗标 + 倒计时），现在参与视图路由：engine 的 `today`
  对任务与项目都改为 `open && (scheduledDate <= today || dueDate <= today)`，`ViewFields` 增
  `dueDate`，`upcoming` 保持不变；粗筛（`buildTaskViewWhere` / `buildProjectViewWhere`）改用
  `AND` 包住的 `OR`，以免压掉调用方搜索自身的 `OR`，设备引擎的视图粗筛与
  `task-query-match.ts` 的 today 判断同步跟进。Today 里被截止日期拉进来的未来计划项显示灰色短
  日期 chip（`ScheduledBadgeMode` 新增 `'future'`）。侧边栏与手机首页的 Today 计数拆成
  `todayDueCount`（截止 ≤ 今天）与 `todayCount`（其余），在灰色计数前显示红色截止徽章（为 0
  隐藏、超过 99 显示 `99+`），新到黄点不变。新增 `deadlines` 视图与 `/deadlines` 路由（桌面、
  Web、手机），只能经 Quick Find 的列表组进入、不在侧边栏、不带计数，按截止日期升序（逾期在前）
  再按 Position / Feed Position 排序，扁平列表、不分组、不可拖动重排。截止日期到期把条目带进
  Today 也算「新到」：`FeedItemBase` 新增 `dueSetAt`（截止日期字段的 HLC 墙钟，仅 Today、由后端
  `feed.service.ts` 与本地引擎给出），`ListOptions.clockOf` 改为 `clocksOf`（`ReplicaRow.clocks`）
  以便一次读出多个字段时钟，`useNewInToday` 用新的 `arrivedOn` / `newInTodayDate` 同时评估计划与
  截止两条路径，已读键取把条目带进 Today 的那个日期（两者都成立时计划优先）。重复实例随源条目
  带上截止日期：`planRepeatInstance` 按 `shiftDateKey(dueKey, daysBetweenKeys(sourceScheduled,
occurrence))` 派生（与 `planRepeatSkip` 一致），null 保持 null，确定性 id（ADR 0012）不受影响。
  契约 fixture（`VIEW_CONTRACT` / `domain-contract.spec.ts`）补 `dueDate` 用例与 Today /
  Deadlines 的期望 feed，i18n 补 `nav:deadlines` / `task:deadlinesEmpty`，`CONTEXT.md` 更新
  Deadline、Repeat Instance 与 New in Today 词条并新增 Deadlines 词条。

### Changed

- **ui**: 项目与区域元数据行重做 (#186) — 项目与区域详情页头部的元数据行改为 Things 3 风格的两槽
  布局，并纠正「回顾日期被当成截止日期」的观感。共享原语里新增 `MetaRowLayout`（左槽放标签 /
  计划 / 重复，右槽右对齐放截止日期 / 下次回顾日，左缘与备注对齐）与 `MetaDivider`（右槽内组间
  细线），`MetaTagDots` 换成 `MetaTagPills`（底色由标签色经 `color-mix` 调出、圆点加完整标签名、
  换行而非截断成五个点）；`MetaBadge` 新增 `accent` 变体（交互蓝，表示需要注意但不逾期），红色
  仍只留给截止日期。项目行的左槽是标签 pill、计划日期与重复摘要，右槽是截止日期 `|` 下次回顾日：
  计划日期 ≤ 今天时显示填充黄星与「今天」（When 永不过期），`SOMEDAY` 用侧边栏同色的 `CloudSun`，
  未来日期用 Upcoming 色的 `CalendarDays`；重复徽章改为显示一行摘要（如「每天」「每 2 周」
  「每周 · 一、三」，新增 `formatRepeatSummary`，星期顺序跟随用户的周起始偏好、名称经
  `Intl.DateTimeFormat` 本地化）。回顾徽章按日历天比较（`nextReviewDate < startOfTomorrow`），
  到期显示强调蓝的「该回顾了」而不再用截止日期的红色，遗留空值视为到期。区域元数据行一并迁移到
  新的布局与标签 pill，让项目与区域的页头骨架一致；i18n 补 `review.due` 与重复摘要相关词条。

- **ui**: 已了结任务与归档分组标题按了结时间排序 (#187) — 项目视图的已了结区此前按列表 Position
  渲染，且未分组（扁平）的任务一律排在归档分组标题块之上；现在与 Things 一致，任务与归档标题
  交错进同一个列表、按了结时间从新到旧排列（任务取 `completedAt`、标题取归档时间），归在归档
  标题下的任务仍留在自己的标题块内、同样从新到旧；时间相同时保持原列表顺序，排序稳定。实现上
  引入判别联合 `SettledEntry`（`task` | `heading`，携带排序键 `at`）与 `byRecentFirst` 比较器
  （ISO 时间戳按字典序比较，无需解析日期），原来的 `ungroupedTasks` / `groupedTasks` 分区换成
  一个由已了结任务与归档标题共同构建后排序的 `entries` 列表。此前「不按了结时间重排」是有意为之，
  本次是明确的产品变更。

- **backend/frontend/ui**: 启动提速：响应压缩、懒加载 shell、存储预暖 (#190) — 两轮改动。第一轮
  停止发送未压缩、带 sourcemap 的响应：后端接入 HTTP 响应压缩
  （`packages/backend/src/common/http-compression.ts`，在 `main.ts` 装配），对大的同步 /
  bootstrap 快照生效，`text/event-stream` 明确排除、SSE 帧永不被缓冲；前端加一个 Vite
  serve-only 插件（`packages/frontend/vite/dev-loading.ts`）压缩开发响应（显式包含
  `application/wasm`）并抑制 Vite 为第三方 SQLite `.mjs` 生成的内联 sourcemap，同时保留应用源码
  的调试映射，SQLite `index.mjs` 的开发响应从约 3.65 MB 降到约 643 KB（Brotli 约 175 KB）、WASM
  从约 869 KB 降到约 406 KB（Brotli）。第二轮是少加载、早启动：设置面板与助手面板改为经
  `LazyShellFeatures` 懒加载（首次打开才加载、之后保持挂载，关闭与清理行为不变），面板布局 /
  停靠 hooks 移到轻量的 `assistant-panel-layout.ts`，使快捷键与 `/agent` 不再静态拖入聊天面板，
  `AppShell` 自身走 `lazyWithRetry`；令牌恢复后立即预暖 SQLite Worker（`browser-storage.ts` /
  `sqlite.worker.ts`），Worker 启动即初始化 WASM，但不打开任何账号数据库、不取 leader 锁，
  `openStorage(userId)` 仍只在身份与 leadership 确认后执行，备好的 Worker 由 leader 复用、在退出
  或会话清理时释放，失败则退回既有 REST 路径；会话恢复（`sessionRecovery.ts`）改走应用共享的
  `['auth','me']` QueryClient query，界面与恢复共用同一个在途请求与结果，`staleTime: 0` 仍保证
  每次恢复都做一次新身份校验、已有缓存用户不会被拿来顶替校验。以真实 Chromium 在隔离的开发服务上
  取样（1000 条合成任务），冷启动首次任务可见约 6.3s → 5.7s、新副本第一条任务可见约 7.1s →
  5.9s，刷新后分别约 1.7s → 1.4s；入口包从约 1117.73 KB（gzip 337.30 KB）降到 472.49 KB
  （gzip 147.56 KB），首屏 `/auth/me` 从 2 次降到 1 次。同步语义与 SQLite 数据模型均无改动。

- **ui/mobile**: Android 快捷添加改用共享 Web 卡片 (android) (#193) — 状态栏快捷添加不再自绘
  原生卡片：`QuickAddActivity` 仍是独立任务里的透明 Activity，但原生只画遮罩与出入动画，卡片
  本身换成一个透明 `WebView`，运行与桌面快捷添加窗口、展开任务同一份 `QuickAddCard`
  （`packages/ui`），落实 ADR 0020。原生卡片是同一张卡片的第二份实现，外观与行为持续偏离桌面与
  展开任务，每加一个字段都要在 Kotlin 里重做一遍，复用 Web 卡片即可消除这层重复。新增 overlay 页
  （`packages/mobile/src/quick-add`：`quick-add.html`、`main.tsx`、`QuickAddOverlay.tsx`、
  `host.ts`、样式），由 `vite.quick-add.config.ts` 单独构建进状态栏插件的 Android 资源、经
  `WebViewAssetLoader` 加载（主 Tauri WebView 里的打包资源从普通 `WebView` 够不到）；
  `QuickAddActivity` 随之瘦成遮罩 + WebView + 一个小的 `TaskoraQuickAddHost` JS 桥
  （`getSnapshot` / `isSystemDark` / `ready` / `submit` / `dismiss`），原生卡片视图、日期 chip、
  选择器、日期帮助函数、drawable、夜间配色与布局全部删除，为 `WebViewAssetLoader` 引入
  `androidx.webkit`。快照升到 v2（`quick-add-snapshot.ts`）：主 WebView 把完整的项目 / 区域 /
  标签 DTO 加上账号时区、周起始、语言与主题推进 SharedPreferences，overlay 把它们写进字段选择器
  已经在用的同一批 React Query 缓存键，因此无需改动任何字段组件；v1 / 未知 / 损坏的快照一律视为
  不存在（只剩收件箱）。提交路径不变：页面经桥把 `QuickAddDraft` JSON 交回，桥再用
  `StatusBarPlugin.submitQuickAdd` 排队，由主 WebView 建任务（冷启动也能建），模式仍为 `close` /
  `continue` / `openInApp`。`QuickAddCard` 新增 `footer` render prop（用触控按钮替换桌面那行
  快捷键提示，即「在应用内继续」「继续添加」「添加」）与 `keepOpenOnEnter`（连续添加开关打开时
  Enter 为添加并继续），`onSubmit` 的选项改为 `QuickAddSubmitOptions`（`keepOpen`、可选
  `openInApp`）。原生专属的状态栏文案（`quickAddAddNotes`、`quickAddTomorrow`、
  `quickAddWeekend`、`quickAddPickDate`、`quickAddSearch`）从 en / zh 中删除；`build:vite` 与
  `dev` 现在先构建 overlay（`build:quick-add`），产物目录加入 gitignore，overlay 跳过约 4MB 的
  Noto Sans SC 字体（Android 系统 CJK 字体就是 Noto Sans CJK）。代价是打开 overlay 要等 WebView
  启动与页面包加载，卡片与键盘出现比原生卡片慢（遮罩立即显示），换来单一卡片实现；quick-add 资源
  缺失时只显示遮罩。

- **ui**: 窄屏条目菜单改用底部 Action Sheet (#194) — 条目的「…」菜单随视口自适应：桌面仍是紧凑
  的 popover / dropdown 浮层，窄屏（触控）改为底部 `ActionSheet`，整行大触控目标；从这些菜单
  打开的字段选择器（标签、计划、重复、截止日期、移动、回顾）在窄屏上以 `FieldPickerDialog` 卡片
  呈现。新增 `common/MenuItems`，用一份声明式 `MenuItem[]` 同时渲染桌面的紧凑行与 Action Sheet
  项，支持 `disabled` / `title` / `destructive` / `separated`（分隔线）与 `firstItemRef` 焦点
  管理；`AreaMoreMenu`、`ProjectContextMenu`（`ProjectMenuPanel` 加 `sheet` 分支）、
  `ProjectMoreMenu` 与 `ProjectHeadingRow` 都改由同一份菜单项驱动，`ReviewSchedule` 的
  `ReviewMenuRow` 换成返回 `MenuItem` 的 `useReviewMenuItem(onSelect)`，使回顾入口能嵌进两种
  菜单形态。右键进入的上下文菜单仍只在桌面保留。

- **desktop/ui**: 主窗口自绘统一窗口 chrome (desktop) (#198) — 桌面主窗口不再有标题栏条带：
  侧边栏、主列与助手面板各自把自己的背景画到窗口顶边，顶部只覆盖一条透明拖拽带。这是窗口 chrome
  的第三次迭代（#35 加过自定义标题栏，#44 退回原生装饰且未记录理由），原生标题栏在满窗布局之上
  压出一条灰色平台条、并让侧边栏颜色够不到顶边，理由这次记进
  `docs/adr/0021-desktop-unified-window-chrome.md`。macOS 保留原生红绿灯
  （`titleBarStyle: Overlay` + `hiddenTitle`，浮在侧边栏上）；Windows / Linux 在 Rust setup hook
  里关掉原生装饰，由前端自绘最小化、最大化 / 还原与关闭，Tauri 的无装饰缩放仍保证边缘可拉；主
  窗口以 `visible: false` 启动，装饰设置完成后再显示，原生边框不会闪一下，`--hidden` 自启动路径
  仍常驻托盘。条带高度是单一 CSS 变量 `--titlebar-h`（macOS 28px、其余 32px，Web 与 Android
  不设、记为 0）：`md` 及以上由共享布局给主列与助手面板补上，侧边栏只经 `--sidebar-inset-top`
  （macOS 16px、其余 0）避开红绿灯；`md` 以下把 `--titlebar-h` 并进 `--safe-area-top`，顶栏、
  抽屉与全屏对话框像避开 Android 状态栏一样避开它。层级上拖拽带在 `z-40`、侧边栏账号按钮紧随
  其上（`z-41`）、窗口按钮在模态浮层之上（`z-60`），窗口按钮吞掉 `pointerdown` 且从不获取焦点，
  因此操作它不会关掉已经打开的 Radix 对话框。已知代价：Windows 11 的 Snap Layouts 悬停不再出现
  （Win+方向键与拖到边缘仍可用），Windows 上还原因最大化窗口时可能短暂看到原生边框。

- **docs**: README 重写为产品落地页 (#189) — `README.md` 与 `README.zh-CN.md` 从面向开发者的
  monorepo 说明书改为产品落地页，并补上本地化截图。结构改为入口优先：图标、标语与快捷链接、
  首屏截图、「为什么是 Taskora」、截图网格、功能分区（组织 / 规划 / 更快工作）、应用下载、
  自托管、FAQ 与开发入口；原先的四个客户端小节（桌面、Android、Web、Docker）合并成一张「获取
  应用」表格，覆盖 macOS、Windows、Linux、Android 与 Web，未签名构建的提示也合并成一处；冗长的
  手工开发步骤换成可直接复制的自托管流程（拉 compose 与 env 模板、改密钥、
  `docker compose up -d`）以及升级（`docker compose pull`）与 `pgdata` / `blobs` 卷的备份说明；
  深入内容改为指向 `docs/keyboard-shortcuts.md`、`CONTEXT.md`、`docs/adr/`、`CHANGELOG.md` 与
  `docs/versioning-and-deployment.md`；CI/CD 清单、各包脚本表、手工构建镜像命令与许可小节等
  陈旧或纯内部内容从前页移除。`docs/images/screenshots/` 下新增 Today、项目、任务、Upcoming、
  日历与深色模式的本地化截图对（`-en` / `-zh`）。

### Fixed

- **ci/mobile**: Android 附件 Provider 冲突与缺失 APK 的补发通道 (android) (#184) — 附件分享改用
  自己的 `AttachmentFileProvider` 子类，避免 Android manifest 合并把它与 Tauri 默认 provider
  合并（v0.8.0 的构建因此报错）；authority、仅缓存目录的路径与逐 intent 的权限授予保持不变。
  常规 CI 现在会真正构建一次 arm64 未签名 release APK，覆盖 manifest 合并、Kotlin 编译与打包；
  另加一条受控的手工补发路径，供某个既有 release 缺 APK 时使用——要求 main 分支、版本一致、旧
  tag 是当前提交的祖先，不移动 tag、不覆盖已有 APK，并在 APK 旁附上
  `Taskora-vX.Y.Z-android-build.json` 记录源码出处。

- **ui**: 日切换与回到前台时刷新 Today 的新到标记 (#191) — 应用在后台跨过午夜、或账号时区变化
  带来日期跳变时，账号日历时钟与 **New in Today** 标记现在保持同步。`useCalendarDay` 除 `window`
  的 `focus` 与 30s 轮询外也订阅 `document` 的 `visibilitychange`，监听器随第一个订阅者惰性挂上、
  最后一个退订时移除，与既有的计时器 / `focus` 生命周期一致；`useNewInTodayKeys` 与
  `useHasNewInToday` 改为依赖 `useCalendarDay()`，于是「新到」状态会随当前日期变化（含时区导致
  的日期变化）重算，而不只在条目或 `todayReviewedOn` 变化时重算，挂载时抓取的已读基线仍保留，
  进入 Today 依旧不会立刻清掉它自己的黄点。跨午夜只是视图推导，不写任务、不产生同步往返。

- **ui**: 手机回顾栏改用图标导航按钮以放下 (#195) — 手机回顾栏此前放不下「上一个 / 下一个 /
  延后 / 标记已回顾」四个文字按钮，底部一行被挤窄甚至溢出。现在「上一个」与「下一个」在手机上只
  显示图标（桌面仍带文字标签），并补上 `aria-label` 以免屏幕阅读器失去含义；「标记已回顾」允许
  收缩（`min-w-0`）并截断标签，把空间让出去而不是把整行顶出边界；「延后」与「标记已回顾」收进
  右对齐的 `ml-auto` 容器，整栏间距改为 `gap-1`，导航在左、动作在右。回顾导航逻辑不变：上一个 /
  下一个仍只在本轮内前后移动，到头 / 到尾时禁用。

- **ci/mobile**: Android 自适应图标缩放到 72dp 视口 (android) (#196) — 自适应启动图标此前把画面
  拉伸铺满整个 108dp 前景画布，而启动器只显示中心 72dp（其余留给视差并被遮罩裁掉），于是图标看
  起来明显比 iOS 与 Web / 桌面方块更大更挤。`scripts/generate-android-icons.py` 现在把主图标缩到
  可见的 72dp 区域（`fg_px * 72 // 108`）再居中合成到透明的 108dp 画布上，而不是铺满整块画布；
  白色背景（`values/ic_launcher_background.xml` 的 `#fff`）仍从留白与主图透明角落透出，因此圆形 /
  圆角方形遮罩裁到的始终是白色，观感与 iOS / Web 一致。五个密度的 `ic_launcher_foreground.png`
  已重新生成。

## [0.8.0] - 2026-10-08

### Added

- **engine/api/backend/shared/ui/desktop/mobile**: Task 附件与内容寻址 Blob 存储 (#172) — Task
  现在可以附带文件（仅 Task，Project / Area 不设）。附件拆成两层：**Attachment** 是新的同步实体
  （`taskId` / `name` / `mimeType` / `size` / `blobHash` / `position`），合并、排队与重放完全同
  Subtask——只存在于父 Task 内，随父 Task 进出 Trash、随倾倒废纸篓物理删除，单独移除走 Delete
  Request，Repeat Instance / Repeat Project Instance 按确定性 id 复制附件行并指向同一内容；
  **Blob** 是文件内容本身，按 sha256 内容寻址、写入即不可变，因此不参与字段级 LWW、永不冲突，
  经专用上传 / 下载通道在设备与 hub 之间传输，从不进 Change Event。离线添加时附件行立刻进
  Outbox、字节进设备侧持久上传队列，Outbox 不等上传；先收到行、hub 上还没有内容的设备把该附件
  显示为「等待上传」并稍后重试下载（上传按 hash 幂等、hub 校验收到的内容 hash）。设备只在打开 /
  预览附件时按需下载并缓存在本机（可随时丢弃重下），hub 按 `(userId, sha256)` 去重存储、经
  `BlobStore` 接口落在本地文件系统卷（docker-compose 新增 `blobs` 卷，备份与迁移要连它一起
  处理），不再被任何 Attachment 引用的 Blob 由 hub GC 在宽限期后回收。所有 Blob 请求按用户
  鉴权，响应带 `Content-Disposition: attachment` 与 `X-Content-Type-Options: nosniff`，只有
  位图白名单在应用内预览，HTML / SVG 永不渲染。UI 上展开卡片底栏新增回形针（可多次添加）、
  原生文件拖入卡片即可添加，附件列表显示类型图标、文件名、大小与传输状态，可重命名、移除、
  拖动排序，位图点击进 lightbox，收起行与备注 / 子任务徽标同排显示附件徽标；桌面 / Web 把非
  图片附件交给系统程序打开，Android 经新本地插件写入缓存目录后用 FileProvider 发 `ACTION_VIEW`。
  「转换为项目」在有附件时先弹确认。`SYNC_PROTOCOL_VERSION` 5 → 6（新增 `attachment` 实体与
  Blob 通道，最低协议仍为 5：旧客户端跳过该实体，升级后由副本迁移触发一次 bootstrap 取回）。
  落实 ADR 0019。

- **engine/api/backend/shared/ui/mobile/desktop**: Review（回顾）(#178) — Project / Area 新增
  三个同步字段：`reviewInterval`（回顾间隔，N × 天 / 周 / 月 / 年）、`nextReviewDate`（下次
  回顾日）、`lastReviewedOn`（上次回顾日，只用于显示、不参与排期），均参与字段级 LWW。参与回顾
  的是所有 Area 与未了结、未进 Trash 的 Project（含 Later Project），Task 不参与、不可关闭。
  侧边栏 Logbook 之前（与 Logbook / Trash 同组）新增 Review 入口并在行尾显示待回顾数，进入后是
  待回顾对象的快照列表，再进入**回顾模式**逐个展示对象的完整可编辑页面，配回顾栏：进度
  「3 / 12」（点开显示本轮队列，只区分已处理 / 未处理，当前对象整行高亮）、回顾设置、上一个、
  下一个、延后 ▾、标记已回顾、退出（手机端为底部工具栏）。处理（标记已回顾、延后、了结、删除）
  后自动去本轮下一个未处理的对象——先往后找、后面都处理过就从头找，本轮全部处理完才结束并回到
  列表；上一个 / 下一个只在本轮快照里前后移动、不标记也不改日期，到头 / 到尾时禁用、不结束本轮。
  回顾设置是「…」菜单里与「重复」「截止日期」一致的「回顾」行：菜单行「回顾」与
  Project / Area 页头的下次回顾日元数据徽章都点开同一个 `ReviewPicker`——间隔编辑器
  「每 [− N +] [天|周|月|年]」即时生效、快捷日期（明天 / 1 周后 / 1 个月后）+ 日历、上次回顾日
  只读；「标记已回顾」只在回顾里提供，避免设置选择器误推排期。**标记已
  回顾 = 账号时区的今天 + 间隔**（11.1 每月、12.3 才回顾 → 1.3），同时把 `lastReviewedOn` 记为
  今天；修改间隔时，下次回顾日若仍是排期算出的值（上次回顾日、从未回顾则创建日，加原间隔）就按
  新间隔从同一起点重算（结果可能已到期），被手动改过（直接编辑、延后、新建时指定）则不动；新建
  （含 Repeat Project Instance 派生）写入该类型的默认间隔、下次回顾日为当日 + 间隔、从未回顾。
  设置 → 通用新增两档默认回顾间隔（项目每周、区域每月，只用于新建，改默认不影响已有对象）。
  纯函数落在 engine 的 `planReviewSchedule` / `planMarkReviewed` / `planReviewUpdate`，副本
  迁移 12 → 13 → 14、hub 两个 Prisma 迁移跟进。
  回顾模式的快捷键（只在 `/review` 中生效）：标记已回顾并进入下一个（⌥⌘R /
  Ctrl+Alt+R / Alt+Shift+R）、延后（⌥⌘L / Ctrl+Alt+L / Alt+Shift+L）、下一个
  （⌥⌘→ / Ctrl+Alt+→ / Alt+Shift+→）与上一个。

- **ui**: 项目的「移动」入口 (#177) — 项目右键菜单与项目详情页「更多」菜单新增与任务相同的
  「移动」（FolderTree 图标），任务与项目共用抽出的 `MovePickerList`：搜索、当前位置打勾、
  高亮、键盘导航与行样式一致。项目目标只有「无区域」与所有 Area（与侧边栏同序），搜索仍按前缀
  优先；选中后只写 `{ areaId }`、选当前位置不写入，随即关闭选择器，沿用既有数据层处理离线同步、
  错误回滚与 Trash 隐式放回。

- **api/ui**: 手机首页的悬浮添加按钮 (#173) — 抽出 `useCreateListActions` 承载新建项目 / 区域的
  共享逻辑（空标题创建、成功后标记自动编辑并跳到详情页、失败 toast），桌面侧边栏「添加」菜单、
  底部动作与手机 FAB 三处复用。手机首页的 FAB 从「只能添加任务」改为朝上菜单：添加任务
  （落收件箱）/ 新增项目（顶层，不归属区域）/ 新增区域，文案与侧边栏「添加」菜单一致。

- **ui**: 删除区域前的确认对话框 (#176) — 区域「…」菜单的删除不再立即执行，先弹出确认对话框
  （标题带区域名、说明删除的影响），确认后才提交，失败照旧 toast；提交中重复点击被忽略。

### Changed

- **ui**: Sidebar Drop 新增 Upcoming 与 Anytime 落点 (#182) — 拖 Task（多选时整组）或 Project
  行到侧边栏 Upcoming 时条目不动、在该行旁弹出计划日期卡片（整组共用一张、不预选），选定后
  写入；拖到 Anytime 则清除计划（同计划卡片「清除」，提醒与重复规则随之清除），无归属的 Inbox
  任务一并转入 Anytime，已在 Anytime 的跳过。侧边栏这两行随之注册为可接收落点，与其他落点一样
  在悬停时高亮；Calendar、回顾与「N 个稍后项目」入口仍不是落点。

- **ui**: 稍后项目的小节支持拖拽 (#180) — Later Projects 页与区域页「稍后项目」的两个小节里，
  「某天」小节的行可拖拽排序（排序持久化仍写回全量项目顺序，隐藏项的槽位不变），「计划」小节
  按日期排、不可节内排序；两节的行都可拖到侧边栏（改归属、改计划、完成、删除），拖动时原行留作
  不可见空位、由浮层跟手，与列表内排序共用应用级 DndContext。

- **engine/api/backend**: 删除区域时其下项目与任务进 Trash (#181) — 此前删除区域只把它物理
  删除、把项目与任务的 `areaId` 置空；现在区域下的项目与任务先一并进 Trash（项目连同其下任务按
  级联规则，直接归属区域的任务单独进 Trash，已在 Trash 的不动），区域本身仍物理删除（Delete
  Request）。放进废纸篓后可以「放回」，放回后不再归属任何区域。规则抽成 engine 的
  `planAreaDelete` 纯函数，hub 与本地副本两个后端共用、口径逐字一致。

- **ui/api**: 产品术语对齐 (#171) — `CONTEXT.md` 的术语条目补上中英对照并逐条给出 `_Avoid_`，
  界面文案随之统一：Trash 的「恢复」改「放回」（与 `putBack` 合并）、项目的「已完成」改
  「已了结」（组件 `ProjectCompletedTasks` → `ProjectSettledTasks`）、Project Heading 一律称
  「项目分组标题」（避免与项目名混淆）、「倾倒废纸篓」及其确认文案统一、中文标点统一为全角。

- **ui/api**: 中文 Someday 文案「将来」改「某天」(#179) — 侧边栏、分组视图、Later 小节、设置、
  状态栏与助手提示、`CONTEXT.md` 与 README 一并替换（「稍后」仍只指 Later Project，不指
  Someday）。

- **api/ui**: 了结任务时乐观更新项目进度 (#174) — 完成（或恢复）任务时按缓存里的旧状态就地
  修补所属项目的进度计数（完成 + 取消 / 非 Trash 总数，ADR 0006），进度饼在勾选当下就开始
  过渡、不等写后重查；完成预览的停留节奏期间显示、提交时接管与失败回滚三处幂等，不重复计数。

- **ui**: Toast 改为自定义图标 (#169) — 关掉 sonner 的 rich colors，类型只体现在 16px 线性
  图标的语义色上（成功 / 错误 / 警告 / 信息 / 加载），底色统一为毛玻璃 popover 与
  shadow-popover，折叠堆叠时隐藏后排内容。

### Fixed

- **engine/api/backend**: 新建任务追加到列表末尾 (#170) — 此前新任务插在最前，与「新条目落在
  底部」的列表语义不符；现在 hub 与本地 engine 两种后端都追加到末尾，乐观缓存同序，保存后位置
  不再跳动。

- **ui**: type-to-find 不再抢走行内编辑的焦点 (#175) — 指针点进行内标题编辑后立刻打字时，
  type-to-find sink 会把焦点抢走；现在焦点位于行内可编辑元素时直接放行。

- **ui**: 项目分组标题的下划线不再切掉圆角 (#183) — 下划线此前取自行的 `border-b`，选中背景
  被压成方角；改为 `::after` 独立绘制并左右内缩，选中时隐藏细线，四角保持圆角。

## [0.7.6] - 2026-10-07

### Added

- **engine/api/backend/shared/ui**: 嵌套 Tag 取代 Tag Group，Quick Find 支持 `#tag` (#158) —
  Tag 新增 `parentId`，层级不限、父 Tag 自己也能打标，Tag Group 实体、`Tag.tagGroupId`
  与 `/tag-groups` 接口整体退役（ADR 0016 取代 ADR 0015 的「Tag Group stays a container」
  一节）。过滤语义随之升级为**子树命中**：条目命中 Tag T 当且仅当它的有效 Tag 里有 T 或 T 的
  任一后代（不向上展开），`tagId` 查询、列表过滤栏、Tag 详情页与 Quick Find 的 `#tag` 一律走
  这条规则，纯函数落在 engine 的 `buildTagTree` / `tagHit`，读时容忍环与悬空 `parentId`，hub
  的 SQL 粗筛先把子树展开成 id 列表再走 `IN (...)`。UI 上 Tag Picker 无搜索词时按树缩进显示、
  有搜索词时扁平结果并在行尾标出父路径；列表过滤栏逐层展开子 Tag，再点一次已选中的 Tag 退上一层；
  Tag 详情页按子树命中，可点击的父路径放在标题前、过滤栏只列直接子 Tag；Tags 管理页改为树形大纲，
  上下拖决定位置、左右拖决定层级（被拖 Tag 的子树随之收起移动，拖不进自己的后代），「新建子 Tag」
  「移到…」「删除」桌面端走右键菜单、触控端左滑弹出 Action Sheet，折叠状态只存本机。Quick Find
  词首输入 `#` 进入 Tag 补全，`Enter` / `Tab` / 点击把高亮项变成 chip 并删掉输入框里的 `#xxx`
  （同名唯一时输入空格也转换，光标在开头按 `Backspace` 删最后一个 chip，IME 组字期间不触发），
  多个 chip 取 AND 且各自按子树命中，「区域与项目」「任务」结果随之收窄，「继续搜索」把 chip 写进
  `/search?q=&tag=`。这是一次不兼容的 wire 变化：`SYNC_PROTOCOL_VERSION` 4 → 5，`tag-group`
  实体退役、`tagGroupId` 改名 `parentId`、实体索引 `tag_group_member` 改 `tag_parent`，协议 4
  客户端直接收到 426 并提示升级；hub Prisma 迁移把每个 Tag Group 按原 id、标题与位次转成顶层 Tag、
  成员 `parentId = tagGroupId` 并改写 `fieldClocks` 键，本地副本用同一套规则逐字转换、改写 Outbox
  里的 `tag-group` 写，另记一次性 bootstrap 标记兜住设备先于 hub 升级的情况，保证两端逐字一致。
  成环在写入时拒绝（REST 400，UI 不允许拖进后代）、hub 合并后由 `repairEntity` 的祖先探针断开、
  读取时 `buildTagTree` 兜底。助手工具、Quick Add relay 协议与 Android 状态栏快照一并跟进。

- **api/ui/desktop**: 键位可自定义，设置页新增快捷键面板 (#161) — `keymap.ts` 从散落的判断改为
  声明式注册表 `SHORTCUTS`（每个动作带各平台默认键位），`resolveAction` 把事件归一成 chord 后先查
  用户覆盖再查默认，`shortcutLabel` 读同一张表，重绑后按钮提示同步更新。设置新增「快捷键」面板列出
  全部动作，点击某个绑定即录制下一个 chord（Esc 取消），与已有动作冲突时把该 chord 从原动作移走并
  提示；Quick Add 卡片的键位是同一注册表的独立 scope，只在 scope 内查冲突。覆盖只存本机
  （localStorage `taskora-keybindings`）且不跨端同步——chord 含平台修饰键，换平台无意义。系统级
  Quick Add 热键是例外，仍由 Rust 持有、存在应用数据目录的 `quick-add-shortcut.json`，重绑时先注册
  新热键再注销旧热键，被别的应用抢占也不至于两个都没有；编辑器 ⌘Enter、卡片内 Enter / Esc 与
  type-to-find 不可重绑，面板里单列为固定快捷键。落实 ADR 0017。

- **ui**: Upcoming 拖动改期 (#163) — Upcoming feed 的行可以拖到别的日期分组、月份分组或分组标题上
  重新排期：拖动期间实时预览占位、松手才写入，只提交计划字段；同组内拖动只改顺序、保留原具体日期，
  跨月份落到具体某天按天改期，落到月份标题取该月第一天，跨年月份用目标年份的第一天。空分组仍保留
  放置区，重复预告不注册为可拖动任务；多项拖拽把整组选中的任务一起改到落点日期，日期都写完再保存
  顺序。展开中的编辑卡片与多选模式下禁用拖动。

- **engine/api/backend/shared/ui**: Today 的「新到」标记 (#164) — Today 中「上次看过 Today 之后
  再随日期到来」才进入的 Task / 独立项目行自成一区、行首带黄点（参考 Things 3）：计划日期晚于账号
  偏好 `todayReviewedOn`，且排期写入时刻（`scheduledSetAt` 的 HLC 墙钟，按账号时区）早于该计划日期
  ——当天才手动排到今天、或排到已过日期的不算，写入时刻未知的旧数据只按基线判断。进入 Today 即把
  已看日期推进到今天（本次访问内黄点保留，离开后消失），已看日期只进不退并经账号偏好跨端同步，从未
  看过 Today 时一律不标新到；纯推导，不改写 Task / Project 字段。区内的行只可区内重排，侧边栏与
  手机首页的 Today 入口在有新到时带黄点。

- **ui**: 展开任务卡片的归属入口 (#166) — 展开的任务卡片在背景与阴影之外、右下方单起一行显示直接
  所属的 Project / Area（参考 Things 的低调文字入口；有 Project 显示 Project，否则显示直接 Area，
  Bucket 不算归属，无归属不显示），点击可「前往项目 / 前往区域」或打开既有 MovePicker「更改项目 /
  更改区域」。已在该 Project / Area 页面、或当前视图正按 Project / Area 分组时隐藏且不留空位；长
  名称截断，完整名称给在提示与无障碍名称里，桌面用右对齐紧凑 Popover、窄屏用 FieldPickerDialog。

- **api/ui**: 桌面多选、多项拖拽与拖到侧边栏 (#168) — 对齐 Things 3 Mac：Selection 新增
  `anchorId`，⌘/Ctrl+点击切换并以该行作新锚点，⇧+点击与 ⇧↑/↓（`extendUp` / `extendDown`，可在
  设置改绑）从锚点连续扩展，多选只含任务行。多选状态下拖动其中一行即整组随动，浮层右侧
  `DragCountBadge` 显示件数；整组拖动要等在拖拽开始那次提交之后的 effect 里收起其余选中行，浮层才
  以测得的被拖行位置为基准，否则收起会先把基准顶偏、浮层脱手。右键菜单同样作用于整组：菜单顶部显示
  件数，动作一次应用到全部选中行（标签在各任务原有标签上增减），重复、跳过本次、转换为项目仍只在单
  行菜单出现。同一批改动带来 **Sidebar Drop**：Task 行（多选时整组）与 Project 行可直接拖到侧边栏
  落点——Inbox（清归属与计划、保留截止日期）、Today / Someday（改计划）、Logbook（完成，重复任务
  照常派生）、Trash（删除）、区域 / 项目（移动，项目落在无 Heading 部分末尾），可接收的行悬停高亮、
  不接收的行不动，松手停留在当前页面、Selection 清空，已在目标处的条目跳过，Project 不接收 Inbox /
  项目。落点规划抽成纯函数，执行复用右键菜单 / 选择器同一批 mutation（含剩余任务询问与提醒规则），
  不另写一套；拖到侧边栏时源列表的占位回到原位、不暗示组内重排，侧边栏滚动区在拖拽接近上下缘时自动
  滚动。架构上把各个列表（`TaskList`、`ProjectTaskLayout`、`GroupedFeedListView`、`Upcoming`、
  区域详情、搜索）与侧边栏项目 / 区域排序收进应用级单一 `DndContext`（`AppDndProvider`，ADR 0018），
  各 surface 按 id 前缀认领自己的事件，原有的浮层跟手、实时预览、让位与 FLIP 约定不变；触控端与
  Multi-Select Mode 不受影响。

### Changed

- **api/mobile**: 跟随系统主题改用原生 Android uiMode (android) (#162) — edge-to-edge 下状态栏 /
  导航栏透明，图标明暗按原生 DayNight 判断，App 内手动指定亮 / 暗主题时会出现深底深图标。改为壳侧
  监听 UI 模式变化、经 background 插件把主题推给 WebView（先订阅再读快照，读取期间收到的事件不被
  旧快照覆盖），`preferences.store` 里系统主题优先于 WebView 媒体查询且不持久化，手动主题不受影响；
  主窗口再监听 `<html>` 的 `class` 变化回写，两向保持一致。

- **ui**: 收紧备注编辑器的段落间距 (#165) — `prose-sm` 的段落外边距上下各约 16px，段间距接近行距
  的 5 倍，备注里像空了一大行；用 `prose-p:my-1` 降到 4px，段落间仍比段内行距略宽。必须用 utility
  覆盖——prose 规则在 components 层，写进 `tokens.css` 的 `@layer base` 会被压过。

- **ui**: 分组标题改回 Things 风格 (#167) — 分组视图（Today / Anytime / Someday）里的 Project /
  Area 组头此前被做成蓝色纯文字链接、丢了进度环与图标，现改回任务上方的标题：保留 Project 进度环与
  Area 图标，标题用正文字阶半粗体、默认前景色，hover（或键盘聚焦）才变蓝并露出右侧 `>`，无文字
  下划线、无整行 hover 背景，保留淡色分隔线与组间留白，长标题截断且箭头不推动文字。Project 标题行
  右侧常驻原有截止日期徽标（未到期灰、到期 / 逾期红），点击进度环完成项目仍走剩余任务询问；Area 组头
  新增复用详情页操作的右键菜单（Tags / Delete）。键盘 ↑/↓ 移动 Selection 与 DOM 焦点时跳过 Project /
  Area 组头，Alt+↑/↓ 在组内跳到首 / 末任务，完成 / 取消 / 删除后的自动选邻居也跳过组头；组头仍作为
  拖拽投放面与「下方新建」的上下文，独立 Project 行、项目内部 Project Heading 与平铺视图不受影响。

### Fixed

- **ui**: 展开的任务行不再作为拖拽源 (#159) — 可排序行容器的拖拽与展开的编辑卡片冲突，在卡片里
  拖选文字会触发整行拖动。展开后不再注册拖拽（分组视图、项目页与任务列表），文字选择恢复正常。

- **desktop/ui**: 托盘菜单与 Quick Add 透明窗口的伪影 (#160) — 透明窗口会把超出边界的投影裁成
  矩形灰底，托盘菜单去掉投影、只留边框区分，窗口贴合内容；Quick Add 窗口宽 600px，低于 md 断点走
  窄屏的居中 Dialog，遮罩在透明窗口里同样会铺成整块灰底，`Dialog` 补上 `data-dialog-overlay`
  标记、在该窗口里置为透明。

## [0.7.5] - 2026-10-05

### Added

- **engine/api/ui/backend/mobile**: 重复项目 (#157) — 把重复任务模型延伸到 Project：Project
  新增 `repeatRule`（与 Task 同一结构，仅 ScheduledType=DATE 可设，离开 DATE 自动清除）
  与 `repeatSourceId`。完成带规则的项目时派生下一个 **Repeat Project Instance**——项目连同
  Headings、任务与 Subtask 整份复制、全部重置为未完成，项目与任务的计划日期按出现日位移、
  截止日期同步平移；未进 Trash 的任务不论这一轮完成 / 取消都复制（Things 3 的模板语义），
  但项目内重复链的后代只复制链的源头（否则一个每日重复的任务会留下 7 个实例）。派生沿用
  确定性 id + `repeatSourceId` 幂等，两台离线设备同时完成同一个重复项目只得到一个下一轮项目。
  完成仍有未了结任务的项目时先弹确认框：把剩余任务标记为完成 / 取消，还是返回
  （`completeProject` 新增 `settleRemaining`，一并了结时不触发任务自身的重复派生）。重开项目
  只重开项目本身，已了结任务与已派生的下一轮不动。另补上「跳过本次」：
  `POST /projects/:id/skip`（不可跳过返回 409），项目与其内未了结任务的日期一起推进，入口在
  项目右键 / 更多菜单「重复」旁；项目 feed 行、侧边栏行与项目页标题出现 ↻ 标记。engine 副本
  迁移 9 → 10（`project.repeatRule` / `project.repeatSourceId`），Prisma 同名列 + `repeatSourceId`
  索引，sync codec / DTO / 事件 / feed 下发解析后的规则对象，旧客户端忽略新字段。

- **shared/api/ui**: 计划日期与截止日期支持自然语言输入 (#155) — `ScheduledDateField` /
  `DueDateField` 顶部新增输入框（桌面端打开即聚焦，触控端不聚焦以免弹键盘）。输入为空时
  保持原有快捷项 + 日历 + 提醒区不变；有输入时整块换成候选列表（最多 6 条，`↑` / `↓`
  移动、`Enter` 选中、IME 组字期间忽略按键，无候选显示「无法识别」行）。中英文规则同时
  生效，与界面语言无关：关键词（`today` / `明天` / `后天`）、星期（`fri` / 下周五 / 本周五）、
  相对（`3天后` / `in 2 weeks` / `1个月后`，月末收敛）、模糊（`下周` / `周末` / `月底` /
  `明年`）与绝对（`8/12` / `2026年10月12日`）日期，并可在任意日期前后附时刻
  （`9点` / `9:30pm` / `中午` / `晚上`）；只有时刻时落今天、时刻已过则明天。解析器是 `shared`
  里的纯函数 `parseWhenQuery`（Temporal `PlainDate`，不涉及时区），每次输入逐字重新解析并按
  前缀补全。计划日期带时刻且上下文可设提醒时一并写入 `reminderTime`，截止日期忽略时刻；
  从输入框选中一律关闭弹层。MovePicker 的 `activeIndex` / 滚动 / `↑↓/Enter` / IME 保护抽成
  `useListboxNavigation` 复用。

- **desktop**: 自绘托盘右键菜单，跟随主题与语言 (#152) — Windows / macOS 的托盘右键不再用
  系统原生菜单，改为同 App 主题、同语言的 `tray-menu` webview 窗口（透明无边框，在光标处
  弹出并夹进显示器工作区、失焦隐藏、支持 `↑↓` / `Enter` / `Esc`）；菜单项为「显示
  Taskora」/「新建任务」（Quick Add，带全局快捷键提示）/「退出」。Linux 托盘
  （AppIndicator）不上报点击事件，仍挂原生菜单，文案由主窗口经 `tray_set_labels` 同步，
  同样跟随 App 语言。

- **api/ui**: 桌面侧边栏可拖动调宽、可折叠 (#153) — 侧边栏右缘新增把手：拖动调整宽度
  （200–400px，默认 240；双击恢复默认，聚焦后 `←` / `→` 每次 16px）；拖到最小宽度以下
  松手会先停住、停顿后依阈值收起或弹回最小宽度（Things 式），折叠后从窗口左缘拉出即可
  恢复。折叠期间侧边栏保持挂载（滚动位置与展开状态不丢）并被 `inert`；宽度与折叠状态
  只存本机，不跨设备同步。

### Changed

- **ui**: 助手面板始终并排，空间不足时让位侧边栏 (#154) — 面板取消覆盖（浮层）形态，
  任何桌面宽度、任何路由（含 `/calendar`）都与内容并排，不再带遮罩，Esc 交还主区。
  主区保底 560px：面板宽度上限取「视口一半」与「视口 − 560」中较小者，下限仍为 320px。
  侧边栏宽 + 主区保底 + 面板宽放不下时，侧边栏先自动收起（复用其折叠，收起后仍可从左缘
  拉出），关闭面板或窗口变宽即自动展开；自动收起状态持久化、重启后也能恢复，用户亲手
  展开 / 收起后即由用户接管、不再自动恢复。

### Fixed

- **mobile**: 系统栏图标明暗跟随 App 主题 (#151) — edge-to-edge 下状态栏 / 导航栏透明，
  图标明暗此前按系统 DayNight 判断，App 内手动指定亮 / 暗主题时会出现深底深图标。改为
  主窗口监听 `<html>` 的 `class` 变化、经 background 插件设置（含手动主题）。同时
  `android-signing.py` 生成的 `MainActivity` 去掉原生 insets padding（会把 WebView 挤到
  状态栏下方，并与前端安全区双重避让），只保留 edge-to-edge，系统栏避让完全交给前端
  `--safe-area-top/bottom`。

- **ui**: Upcoming 月份分组显示计划日期 chip (#156) — 月份分组标题只到月，任务行与
  「下次预告」行补上计划日期 chip；本周按天分组的标题已含日期，行上不再重复显示。

## [0.7.4] - 2026-10-02

### Added

- **api/ui/desktop/mobile**: Quick Add 升级为完整草稿卡片 (#147) — 桌面浮窗
  （`QuickAddApp`）与 Android 状态栏浮层（`QuickAddActivity`）从「只能输入标题、
  固定进 Inbox」升级为可在创建前设好备注、计划日期、Tag 与归属的草稿卡片。两端
  共用 `packages/api` 新增的 `QuickAddDraft` 与 `createFromQuickAddDraft(draft)`，
  落库规则只有一份：标题去首尾空白后为空不落库、已删除或已进回收站的 Tag 丢弃、
  归属的项目 / 区域缺失时回落 Inbox，并返回实际落入的位置。桌面浮窗改为窗口透明、
  内部圆角卡片（macOS 毛玻璃）、高度随内容，字段栏与展开任务一致（左侧已设 chip、
  右侧未设图标），归属 chip 默认 Inbox，支持「添加并继续」（保留归属、清空其余
  字段）与键位对齐主应用；主窗口隐藏时创建失败改用系统通知。Android 浮层改为原生
  卡片：可折叠备注、今天 / 明天 / 周末 / Someday 日期 chip 与原生日期选择器、归属 /
  Tag 底部列表（顺序与 `MovePicker` 一致、排除稍后项目）、本机记忆的连续添加开关，
  以及「在应用中继续」把截止日期 / Reminder / 子任务交回 App 并凭 `navigate=task:<id>`
  展开该任务。原生端只展示 JS 写入的 Areas / Projects / Tags / 账号时区与文案快照，
  离线或快照过期也安全（落库前再校验）。提交由单个标题字符串改为 SharedPreferences
  中的 JSON 队列由 JS 按序取走，修掉冷启动连续添加时前一条被覆盖丢失的问题；落库
  失败发系统通知而非静默吞掉。

- **ui**: 可停靠的助手面板 (desktop) (#145) — 新增右侧 Assistant Panel，与全屏
  `/agent` 是同一组 Conversation 的两种视图：当前会话与流式状态（增量文本、运行中
  工具、`agentActive`）提升到全局 store，助手运行中途在面板与全屏之间切换，打字
  效果与运行状态不中断、不出现两份。面板默认宽 360px，可拖左边缘调宽（320px ～
  半视口，双击复位，聚焦后 ←/→ 步进，宽度存本机）；视口 ≥1440px 且当前不是
  `/calendar` 时推挤主区并排显示，否则覆盖在主区之上（Esc 或点面板外收起）。顶栏
  可切换 / 新建会话并跳转全屏，反向支持从全屏「收回到面板」。入口为内容区底部动作
  条紧邻搜索的 ✦ 按钮与快捷键 ⌘J（Windows Ctrl+J、Web Alt+J），移动端不提供面板。

- **ui**: 多选工具栏新增「跳过本次」(#149) — 抽出 `useSkipOccurrence`（原先只有
  右键菜单可用），触屏多选工具栏与「更多」Action Sheet 现在也能对选中的重复任务
  跳过本次，并对链已到头 / 下一次已存在的拒绝给出对应提示。同时加固触屏
  `contextmenu` 识别：Android WebView 触屏选词也会派发 `contextmenu` 且事件本身
  不带 `pointerType`，改以最近一次 `pointerdown` 的指针类型兜底，避免误开菜单。

### Changed

- **api/ui/engine/backend**: Trash 行对齐 Things 3 (#146) — 删除 `TrashTaskRow` /
  `TrashProjectRow`，改由 `FeedItemRow` 渲染任务行与项目行：行样式与状态回到普通
  视图（复选框按完成 / 取消 / 未完成显示且可照常勾选，保留截止日期、标签、备注
  图标、子任务进度与所属项目 / 区域），任务行可展开详情编辑；恢复统一走右键菜单 /
  多选工具栏的「放回」（新键 `putBack`），项目行去掉常驻「恢复」按钮。放回只清
  `trashedAt`、保留了结状态：已完成 / 已取消的任务回到 Logbook，未完成的回原视图。
  在 Trash 中改状态（完成 / 取消 / 撤销）留原地，改计划日期、截止日期、移动、标签、
  重复规则等其他编辑隐式放回，改标题 / 备注 / 子任务不触发放回；进 Trash 时清掉的
  `reminderTime` 不随放回恢复。规则落在 engine 写入层（`planTaskUpdate` 一侧）与
  REST 后端，使菜单、详情、多选工具栏与 Agent 工具行为一致。触屏 Trash 行接入
  左滑多选，工具栏「删除」位置换成「放回」。

- **api/ui**: 助手对话按轮次分组，过程折叠为一行摘要 (#144) — 每轮助手回复改由
  `AgentTurn` 呈现：工具调用与过程步骤折叠成可展开的一行摘要（如「已更改 2 项」），
  正文与批准卡片照常展示，长对话不再被逐条工具输出淹没。

### Fixed

- **backend/engine**: 修复 `drop_sort_order` contract 迁移在有历史数据的库上失败并
  永久卡在 P3009 (#142) — 已发布的 `20261002180000_drop_sort_order` 假设中间版本
  hub 会在启动时物化 Position，但该 hook 已删除且 `migrate deploy` 先于应用启动，
  旧库直升会在 guard 失败后无法启动，空库 CI 无法发现。修正后的迁移在同一显式事务
  内按历史 Engine 算法补齐七张表的空 Position（O(log sortOrder)，不依赖会话时区）
  再断言、删列；backend bootstrap 用专用 PostgreSQL 会话锁串行化检查、恢复与部署，
  仅对「原 checksum + 明确 guard 错误 + 完整旧列状态」的唯一失败记录自动
  `migrate resolve --rolled-back` 后重跑，未知失败或部分删列状态一律保留供人工检查。
  已有 Position、updatedAt、字段时钟与同步日志不变，回填值与协议 4 Local Replica
  7 → 9 逐字一致。CI 新增 `migration-smoke.mjs`，在实际镜像上验证 v0.7.1 / v0.7.2
  历史 DDL + 合成数据、P3009 与空库的启动健康；恢复步骤与发布纪律记入
  `docs/versioning-and-deployment.md`，ADR-0007 更正原先对阶段发布的错误假设。

- **mobile**: Android 系统栏安全区回退 (#150) — edge-to-edge 下内容铺到状态栏 /
  手势条后面，而部分 Android WebView 的 `env(safe-area-inset-*)` 仍为 0，导致内容
  被遮挡。background 插件改为从 `WindowInsets` 读取真实高度，启动时取一次并经
  `insets` 事件推送旋转 / 切换导航方式后的变化，JS 写入 `--native-safe-top/bottom`，
  ui 的 `--safe-area-top/bottom` 取它与 env() 的较大者。

- **ui**: 触控多选工具栏抬到 Android 手势条之上 (#148) — 右下角悬浮胶囊此前贴着
  屏幕底边，与系统手势条重叠。

- **ui**: 备注编辑器在可排序祖先内显示文本光标 (#143) — 可排序行容器带
  `role="button"`，其 `cursor: pointer` 被 `.ProseMirror` 继承，悬停笔记区显示手型
  而非文本光标；显式设回 `cursor: text`。

## [0.7.3] - 2026-10-02

### Added

- **ui**: 自托管 Noto Sans SC，修复 Windows 中文渲染 (#137) — Windows 除微软雅黑外
  没有可用的中文 UI 字体，而雅黑在本界面依赖的 12–13px 字号下观感很差。经
  `@fontsource-variable/noto-sans-sc` 自托管 Noto Sans SC 可变字体（SIL OFL），
  包按 unicode-range 切成 101 个 woff2 分片，浏览器只下载实际用到的片。字体栈
  按「本地命中即停」排序：macOS / iOS 命中 `-apple-system` / PingFang SC 后
  不再下载任何分片（已用无头 Chromium 验证：本地字体覆盖字形时不发 woff2
  请求），Windows 落到 Noto Sans SC，其余平台仍以 Segoe UI / 雅黑 /
  Noto Sans CJK 兜底。同时把 `section` 字号步进的字重从 600 提到 700（调用点
  本已传 `font-bold`，旧组合依赖类名顺序），并让 Vite 不再内联 `.woff2`
  （内联会绕过 unicode-range 惰性加载，还多付 33% 的 base64 体积）。

- **ui**: 新增底部 Action Sheet，触控多选工具栏改为悬浮胶囊 (#141) — 新增基于
  Radix Dialog 的 `ActionSheet` 组件（iOS 形态的底部圆角卡片，整行大触控目标，
  Escape / 点遮罩 / Android 系统返回均可关闭），供触屏替代朝上弹出的
  DropdownMenu。触控多选工具栏由贴着屏幕底边的整条工具栏改为右下角悬浮胶囊：
  胶囊内直接放「计划 / 移动 / 删除」三个图标按钮与「完成」，勾选数用可弹跳的
  圆形徽标显示，其余动作（完成 / 取消完成、截止日期、标签、重复、转换为项目）
  收进「更多」打开的 Action Sheet。图标按钮补上 `aria-label` / `title`。

- **api/mobile**: 点状态栏通知跳转 Today (android) (#136) — 状态栏常驻通知此前
  只用于查看，点按不落到应用内。现在点通知在冷启动（JS 尚未挂载，原生侧暂存
  意图，壳主动 `takeNavigation` 取走）与热启动（原生 `onNewIntent` 投递
  `navigate` 事件）两条路径都会请求导航到 `/today`：新增 `navigationRequest`
  store 与 `useNavigationRequestListener`，沿用 `taskReveal` 的「壳投递、
  Router 内消费」模式。窄屏默认落 `/home`，因此必须显式请求。

### Changed

- **engine/api/backend/shared**: Position 成为唯一排序键，`sortOrder` 退役
  (#138) — 全部可排序实体（Task / Subtask / Project / Project Heading / Area /
  Tag / Tag Group）统一用可空的 fractional Position（字段级 LWW），Area /
  ProjectHeading / TagGroup / Subtask 由此新增 `position`。此前这四类只有整数
  `sortOrder`，重排要整列重写序号，并发拖拽不会收敛；Task / Project / Tag 上
  `sortOrder` 与 Position 冗余，且写入路径口径不一，导致侧边栏未分组项目的
  底序、稍后项目「计划 / Someday」两节、Android 状态栏同日任务按 `sortOrder`
  排序，与真实 Position 顺序脱节。现在读取点一律只读 Position，重排只给必须
  移动的行分配新 key（`planReorder` / `repositionMinimal`）；存量空 position
  的行按 hub 原先下发 legacy 行的同一口径（`synthPosition(sortOrder,
createdAt)`）补齐，本地副本在 7 → 8 迁移里完成，值与设备早已收到的 wire 值
  逐字相同、不产生可见变化。wire 不再携带 `sortOrder`，
  `SYNC_PROTOCOL_VERSION` 3 → 4，hub 的 `minProtocolVersion` 同步升到 4：
  协议 ≤ 3 的客户端会收到 426、停止同步并保留 Outbox，提示升级（协议 3 客户端
  对上述四类实体的重排只写 `sortOrder`，会被 hub 永久拒收而静默丢失，属损害
  而非仅「看不到新功能」）。Prisma 迁移 `20261002120000_sort_order_entity_positions`
  加列，`20261002180000_drop_sort_order` 删七张表的 `sortOrder`（仍有空
  position 时主动失败，避免丢掉唯一的排序信息）；Local Replica schema 由 7
  升到 9。

- **ui**: 同步指示器只在离线或需要升级时出现 (#140) — 此前常驻角落的「同步中 /
  已同步」小标签在正常态也一直占着右下角。现在 `idle` / `syncing` / `synced`
  一律不渲染，只在 `offline`（显示 Outbox 待同步条数）与需升级（hub 要求更高
  的同步协议，或副本来自更新版本）两种异常态出现，直到恢复或安装新版本。

### Removed

- **mobile**: 移除下拉刷新同步 (#139) — 下拉手势归还 Quick Find，移动端不再用
  `PullToRefresh` 包裹内容区，一并删除只为它存在的 `requestPullSync()`。同步仍
  由启动、本地写（Outbox flush 后防抖）、回前台以及前台存活的 SSE 提示触发，
  已覆盖手动刷新的场景。

## [0.7.2] - 2026-10-01

### Added

- **ui/api/backend/engine/shared**: Tags 对齐 Things 3 (#134) — 补齐「打标」「过滤」
  「管理」三个环节。新增**有效 Tag** 语义：过滤与查询时 Task 的有效 Tag =
  自身 Tag ∪ 所属 Project 的 Tag ∪ 所属 Area 的 Tag（Project 同理），显示时只用
  自身 Tag，纯推导、不写入字段、不影响 LWW；`tagId` 查询在 engine / 后端 / 事件
  流缓存三处统一改用有效 Tag，Project / Area 的 Tag 变化会失效任务缓存。原有的
  `TagsField` 勾选列换成可搜索的 **Tag Picker**：桌面端自动聚焦，支持前缀 / 包含
  相关度排序、`↑`/`↓` 移动、`Enter` 连续切换、`Esc` 关闭，无同名 Tag 时列表末尾
  出现即时新建；多选时每个 Tag 显示三态（✓ / – / 空），逐条计算各自的新 `tagIds`
  而非整组替换。Inbox / Today / Upcoming / Anytime / Someday / Logbook、Project 与
  Area 详情页标题下方新增 **Tag 过滤栏**：只列当前列表实际出现的有效 Tag，选中
  Group 出现第二行收窄，再点取消；纯客户端过滤，切路由重置。Tag 详情页改用有效
  Tag 查询并额外列出带该 Tag 的 Project，按 Area / Project 分组展示；Tags 管理页
  改为可折叠大纲，支持拖拽排序（写 fractional `position`，跨 Group 即改
  `tagGroupId`，Group 本身也可排序）、双击改名、色点选色，删除改为 toast 加撤销、
  去掉 `window.confirm`。快捷键 ⇧⌘T / Ctrl+Shift+T（Web 端 Alt+Shift+T）。

- **ui/api/engine**: 可搜索的 Move Picker (#132) — 把右键菜单与触控多选工具栏
  共用的平铺「移动」面板换成 Things 3 式的归属选择器：Inbox 固定第一，其后按
  侧边栏顺序列出 Area（本身可选）与其下缩进的 Project（Later 项目弱化），图标
  沿用 Quick Find；支持 `↑`/`↓`、`Enter`、`Esc`，输入搜索词后变扁平结果并按
  「前缀命中 > 包含命中」排序、项目行尾灰字标出所属区域。同时修正 Inbox 语义：
  Inbox 是「尚未整理」的状态，获得归属即转为 ANYTIME，移入 Inbox 会清除归属
  **并清除计划**；规则放进 `resolveTaskBucket`，创建、编辑与合并修复三条写入
  路径一起归正。写入改为区域 / 项目互斥，换项目时清除 `headingId`。

- **ui**: Quick Find 的继续搜索结果独立成搜索页 (#133) — 弹窗末尾常驻的「继续
  搜索」不再就地展开，而是关闭面板、导航到新的 `/search?q=`：页头是可编辑搜索
  框（改动以 replace 方式写回 `?q=`），范围扩大到已了结（Logbook）与 Trash，结果
  分「区域与项目 → 任务 → 日志 → 废纸篓」四节，任务 / 日志节用普通 `TaskListView`
  行（可展开、勾选、参与键盘 Selection），废纸篓节只读、点击定位到 Trash 页。

- **ui/engine/shared**: Feed 中独立项目行可拖拽排序 (#131) — Project 新增
  **Feed Position**（`feedPosition`，可空 fractional key），项目行在 feed 里与任务
  混排的位次与 Task `position` 同处一个键空间；为空时退回 `position`（既有混排
  结果不变），侧边栏顺序仍只由 `position` 决定。`feedSortKey` / `sortFeedItems` /
  `reorderFeed` 与 re-balance 在 hub REST 与设备副本共用，设备写 Engine（进
  Outbox）、web 走 `POST /feed/reorder`；拖拽时实时预览落点，跨组进入顶部区才写
  顺序。同步新增 `Project.feedPosition` 列（迁移 `20261001120000_project_feed_position`，
  Local Replica schema 6 → 7），经实体注册表进入 wire，旧 hub 拒绝的写入由设备
  留在 Outbox 待其升级后重推。

- **ui/api/backend/shared**: 展开行内联可编辑的子任务列表 (#126) — 任务展开卡片
  里的子任务从静态列表变成可直接编辑的列表：内联输入标题、勾选完成 / 取消完成、
  长按或拖拽调整顺序（insert-after 排序）、就地删除，底栏「添加子任务」在末尾
  打开草稿行（空行不落库、不同步）。新增 / 调整 `insert-after` 排序接口，设备端
  与 REST 端共用同一语义。

- **ui**: 桌面端 IME 打字唤起 Quick Find (#129) — 空闲焦点改由一个视觉隐藏的
  输入框持有，IME 从首键起在其中组字，`compositionend` 后以上屏文字为 seed 打开
  面板，中文等输入法首字符不再丢失；有 Selection、助手页、触控设备时不持焦。

- **ui**: 项目页已完成任务行显示了结日期徽标 (#128) — `ProjectCompletedTasks`
  每行补上 settled 日期，和 Logbook 中的展现一致。

### Changed

- **ui**: 任务展开时隐藏备注 / 子任务徽标 (#124) — 行内的备注与子任务徽标改为仅在
  折叠态显示，展开后内容已直接可见，不再重复；同时精简 chip 样式。

- **ui**: 侧边栏未分组项目列表的拖放目标改为「项目」小节标题 (#125) — 独立项目
  行拖回该区时命中标题而非行间空隙。

- **ui**: 区域页项目列表隐藏已完成项目 (#127) — 与项目页「已完成」单独成节的做法
  保持一致，区域页不再把已完成项目混在未了结项目里。

- **ui**: 区域页任务行不再重复显示区域名 (#130) — `TaskList` 新增 `hideOwnership`，
  页头已表达归属的页面抑制行内归属小字；TagDetail / CalendarDaySheet 等跨容器
  页面保持原样。

### Fixed

- **engine**: HLC 按数值比较并修复小数墙钟 (#135) — 带校准偏移的墙钟常带 `.5`
  （如 `1790857242098.5`），旧实现直接按字符串字典序比较，该小数时间戳会压过
  所有正常时间戳，导致 hub 与设备按错误顺序裁决、比它真正更新的写被丢弃（典型
  表现：新建任务后输入的标题本机可见，hub 与其他设备仍为空）。现在
  `compareHlc` 对非规范时间戳按 `(wallMs, counter, deviceId)` 数值比较，
  `formatHlc` / `setWallOffset` / 恢复状态一律向上取整，收到旧小数时间戳时
  取整吸收；并对副本中带小数时间戳的行做一次性修复：按原时钟整行重推（不重新
  打时间戳）、游标归零后走 bootstrap 收回本机当初丢弃的远端写。

## [0.7.1] - 2026-09-30

### Added

- **ui/api/backend/engine/shared**: Quick Find — 搜索弹窗升级为「搜索 + 导航」的统一入口
  (#121) — 一个输入框既能搜任务，也能跳到任意列表、Project、Area、Tag。结果分四组
  固定顺序展示（列表 → 区域与项目 → 标签 → 任务），组内按相关度排序（标题前缀命中
  优先于标题包含，再优于仅 Subtask / 备注命中）；选中导航目标即跳转，选中任务即
  Reveal（关闭面板、跳到所在视图、展开并滚入视野）。Subtask 标题命中时展示其父
  Task，并在下方逐行列出命中的 Subtask。`↑`/`↓` 跨组连续移动高亮、`Enter` 打开、
  `Esc` 关闭，全程可不用鼠标。默认只搜未了结、未进 Trash 的条目，结果末尾常驻
  「继续搜索」把范围扩大到 Logbook 与 Trash，取代原来的「包含已完成」复选框；在
  扩展范围中打开已完成 / Trash 中的任务会分别定位到 Logbook / Trash 页。桌面端在
  列表视图直接打字唤起（首字符带入输入框；IME 组合输入时只打开面板、交由输入法
  继续组合），移动端在列表顶部下拉唤起。导航目标由客户端从已有的本地查询计算，
  不新增接口；只有任务搜索新增后端方法 `searchTasks(q, { extended })`，其纯函数
  `taskSearchRank` 与排序放在 `@taskora/engine` 的 `domain/search.ts`，设备端与
  REST 共用（REST 侧新增 `GET /tasks/search?q=&extended=`），本地副本上的
  debounce 从 300ms 降到约 50ms。

### Fixed

- **frontend/nginx**: 重新部署后旧 bundle 的懒加载路由 chunk 失效不再自愈 (#120) —
  重新部署会替换带 hash 的 assets，仍跑旧 bundle 的浏览器导航到懒加载路由时抛
  "Failed to fetch dynamically imported module"，且永远不会自行恢复。nginx 改为给
  index.html 下发 `Cache-Control: no-cache`（它不带 content hash，被缓存的副本会
  一直指向已删除的 chunk），`/assets/` 保持 immutable；前端新增 `lazyWithRetry` /
  `loadWithRecovery`，在动态 import 失败时硬刷新一次以拿到新入口，并监听
  `vite:preloadError` 处理失败的 modulepreload。刷新用 10s sessionStorage 冷却
  限流，而不是 once-per-session 标志 —— 那个标志只能靠另一个 chunk 加载成功来
  清除，某个 chunk 永久缺失时会无限循环。

- **backend**: 事务进行中不再冲刷 change events (#122) —
  `ChangeEventCollector.runFlush()` 排空待发布队列时没有重新检查 `txDepth`：一次
  已经在飞行中的 flush 撞上新的 `$transaction` 启动，会把该事务的 descriptor 摘走
  并在 commit 前发布，base-client 回查 payload 时看不到行而静默丢事件；随后的
  commit 已无内容可发布，created / updated 事件就此永久丢失，客户端一直漂移直到
  下次 resync。改为 `txDepth === 0` 才允许 runFlush，并让仅测试用的 `flush()` 在
  不该排空的队列上直接返回而不是空转。

## [0.7.0] - 2026-09-30

### Added

- **engine/api/backend**: Local-first v3 — field-level merges can no longer
  produce entities that violate cross-field invariants (#117) — concurrent
  edits on two devices could each be valid on their own yet combine into an
  invalid entity: a heading owned by another project, a Someday task
  carrying a reminder or repeat rule, a DATE task in the Anytime bucket, an
  active task with a settled time. Both hubs now run the same pure
  `repairEntity` (the rules the REST services always enforced) after
  merging and scrubbing, writing corrections with a winning
  virtual-device-0 clock so every device converges; the tightening side
  wins and consistent states are left alone, keeping normal echoes no-ops.
  The rules themselves (bucket derivation, view filters and sorting,
  delete/restore cascades, convert-to-project, repeat derivation) moved into
  `@taskora/engine/src/domain`, and the Engine backends and the REST
  services are now read → rule → write, with one shared fixture run as a
  contract test on both sides; the "same semantics as REST" comments are
  gone. Unifying them also settled a batch of drifts: device search with
  `completed` now returns settled and unsettled tasks like REST, device
  Logbook sorts by settled time, feeds mix tasks and projects by Position,
  completing an already completed task is a no-op, cascading a project or
  heading into Trash no longer rewrites tasks already in Trash (restoring
  the project no longer resurrects individually deleted tasks), cascaded
  tasks lose their reminders, and converting a task to a project derives
  the bucket instead of copying INBOX.
- **engine/api/backend**: The replica schema and the sync protocol are
  versioned (#117) — the replica tracks migrations with `PRAGMA
user_version` and an append-only list (one transaction per step) instead
  of ad-hoc column probes, and an installation pointing at a newer replica
  is refused with a "upgrade Taskora to sync" state instead of silently
  downgrading. Requests carry `x-taskora-sync-protocol` /
  `x-taskora-client`, responses carry `protocolVersion` /
  `minProtocolVersion`, and a hub requiring a newer protocol answers 426:
  syncing stops, the Outbox is kept and the UI asks the user to upgrade.
  Unknown entity types in a push are rejected one by one and reported
  (`PushResponse.rejected`) instead of failing the whole batch, unknown
  remote entities are skipped on pull, and rejected entries stay in the
  Outbox for a later hub upgrade.
- **engine/api/backend**: Device clocks are calibrated to hub time and the
  change log lives in Postgres (#117) — sync responses carry `serverTime`
  and the Engine derives an NTP-style wall-clock offset (RTT ≤ 5 s),
  persists it and applies it to HLC stamps, while `HybridClock.receive`
  absorbs remote stamps at most `MAX_CLOCK_DRIFT_MS` (1 h) beyond
  calibrated now, so hub-synthesized virtual-device-0 clocks (REST/web
  writes) compare fairly against device HLCs. The in-memory pull ring
  buffer became `SyncChange` / `SyncCounter` tables with per-user
  `UPSERT … RETURNING` seq allocation and 30-day hourly pruning, so hub
  restarts and multiple hub instances share one log and no longer force
  every device into a full bootstrap.
- **engine/api/backend/frontend**: web runs the Engine and REST writes go
  through the merger (#117) — every REST service is now read → domain rule
  → `writeAsHub`, sharing one transactional row-level merge (lock → LWW →
  reference scrub → invariant repair → persist) with device pushes and
  appending to the change log in the same transaction, which retired the
  serialized field-digest detection, the collector tap's sync branch and
  `publishCompact` / `submitVirtualWrite`. On the client, web runs the real
  Engine on `@sqlite.org/sqlite-wasm` + OPFS (one pool directory per
  account) with Web Locks electing a leader tab that owns the replica,
  HLC, Outbox and sync loop while the other tabs proxy reads and writes
  over a `BroadcastChannel` and take over when the leader closes; browsers
  without OPFS/Web Locks, an unreadable replica or a newer replica fall
  back to the REST path and show the upgrade state.
- **engine/api/ui**: Engine-mode reads are reactive live queries (#117) —
  `Engine.watch(query, callback)` lets a query declare the entities (and
  optionally ids) it depends on, reruns only the affected queries after a
  transaction commits, merges same-tick notifications, discards results
  invalidated while in flight and structurally shares unchanged results;
  `useEngineQuery` / `useReplicaQuery` replace React Query in Engine mode
  for task lists and details, feeds, projects, areas, tags, tag groups and
  headings, while optimistic patches stay (Tauri IPC still costs a few
  frames) but go through a mode-dispatching `useQueryCache` facade that
  patches every cached shape of an entity, including project rows and tag
  chips embedded in feeds.
- **engine/api/backend**: Sync no longer ships the whole database (#117) —
  bootstrap is paged (≤ 500 rows per page, ordered structure → unsettled
  tasks → settled tasks → subtasks → compact registry, with a cursor fence
  fixed on the first page and a stateless token), devices stage the pages
  into `_stage_*` tables and swap them in one transaction so a rebuild
  never exposes half a database, while a brand-new device merges pages by
  LWW and can render as soon as the first page lands. Settled tasks older
  than the archive window (365 days by default, `archiveAfterDays`, `null`
  keeps everything) are dropped from the replica and from bootstrap and
  are instead read from a new read-only, keyset-paged
  `GET /feed/logbook/archive` that the Logbook page pulls as it scrolls,
  with archived rows returning to the replica (and their subtasks
  backfilled) when the hub changes them; compact registries now expire
  after the log retention window on both sides, and push treats writes to
  missing rows and dangling references as compactions/deletions instead of
  building partial rows or retrying forever.
- **engine/api/backend/mobile**: Android syncs reminders in the background
  (#117) — instead of a headless WebView or reimplementing reminder rules
  in Kotlin, the hub computes the full plan with the same shared domain
  code (`planReminderDeliveries` in `@taskora/engine/src/domain`, used by
  both the replica coordinator and the hub) and exposes it at
  `GET /reminders/plan`; device registration can request a read-only
  30-day `backgroundToken` (rotated on every registration), a WorkManager
  job runs every 15 minutes when online and not battery-saving and applies
  the plan, and the two writers are ordered by a `PlanSource` (a non-empty
  Outbox or a locally delivered change keeps JS in charge, and the queue's
  notification actions always stay with JS).
- **engine/api/backend/ui**: Repeating tasks v2 (#118) — three additions on
  top of v1. **Skip occurrence**: a new "skip" action in the task context
  menu (disabled with a reason at the end of the chain) rewrites the
  current occurrence in place — `scheduledDate` advances by the rule to the
  first occurrence after the original date that is not before today
  (account time zone), an existing `dueDate` shifts by the same number of
  days, all subtasks go back to ACTIVE and `reminderTime` is kept — with no
  new task and no Logbook entry; the shared `planRepeatSkip` /
  `skipOccurrenceDate` live in the engine domain and are used by the device
  backend and by a new `POST /tasks/:id/skip`, which returns the reason as
  a 409 the client turns back into `RepeatSkipBlockedError`. **`repeatSourceId`**:
  derived instances now record their source task, so un-completing no
  longer deletes the instance (user edits survive complete → undo →
  re-complete, and completion-anchored tasks no longer derive a second
  instance a day later); derivation is idempotent through "source already
  has a live instance" with the deterministic id as the fallback, and an
  instance left in Trash still counts as gone. **Repeat previews**:
  Upcoming and Calendar project the next occurrence of each
  scheduled-anchored chain as a grey read-only ↻ row (one preview per
  chain, never in the past, nothing for completion anchors), derived purely
  by `buildRepeatPreviews` and excluded from selection and drag.
- **backend**: The assistant can set up repeats (#118) — `create_task` and
  `update_task` accept a structured `repeatRule` (unit / interval /
  weekdays / anchor / until, validated by `normalizeRepeatRule` with
  readable errors the model can correct), `update_task` also accepts
  `skipOccurrence`, and `list_tasks` / `get_task` / `list_feed` return the
  rule so the assistant can see and explain recurring tasks.
- **api/ui/mobile**: Touch multi-select mode (#119) — long-press on a task
  row now only starts a drag; row and bulk actions moved to a swipe-left
  gesture that enters Multi-Select Mode, matching Things 3 on the iPhone.
  A swipe locks to its main axis after 8 px, only counts as a selection
  swipe when it moves left within 250 ms of touch-down (the drag sensor
  needs 300 ms, so the two cannot overlap), follows the finger up to 88 px
  and commits at 64 px, revealing a multi-select icon; the native
  `contextmenu` Android dispatches on long-press is simply suppressed. The
  mode itself lives in `useMultiSelectStore` (separate from the keyboard
  Selection), clears Selection and collapses expanded rows on entry,
  highlights checked rows and replaces the FAB with a
  `MultiSelectToolbar` offering Plan / Move / Delete / More (Complete,
  Cancel, Due date, plus Tag / Repeat / Convert to project when exactly one
  row is checked); field edits reuse the `FieldPickerDialog` card. Exits
  are the completed action, Done, a route change and the Android back
  button, which now runs after overlays close and before route navigation;
  Trash and subtask rows keep their long-press menu, and search and the
  calendar day sheet disable the swipe because the toolbar would be
  covered.
- **mobile**: Root-page back now backgrounds the app instead of killing it
  (#116) — a new repo-local `tauri-plugin-background` exposes
  `moveTaskToBack` from the Activity (the shell's `app_exit` command is
  gone), matching native Android behaviour: WebView state and the task
  survive, so returning from Recents resumes in place instead of cold
  starting.

### Changed

- **ui**: Area detail pages no longer render empty states (#115) — the
  "no projects"/"no tasks" copy and its translations were removed, so an
  area with nothing to show only lists the rows that exist.

### Fixed

- **engine/api/backend**: A batch of sync defects found in the review
  (#117) — the Outbox now only coalesces into its tail row, keeping causal
  order so any batch prefix commits (the old merge-into-an-earlier-row
  behaviour deadlocked on foreign keys across 500-row batches; a new
  real-Engine Postgres e2e drives a 601-row offline backlog through the
  hub); push batches are capped at 256 KB and the backend JSON limit and
  nginx body size are raised to 4 MB (the former 100 KB default rejected
  roughly fifty offline creates forever); compacted ids are persisted in
  `_compacted` so repeat re-derivation cannot reuse a dead deterministic id
  after a restart, and a late write to a compacted id makes the hub
  re-broadcast its Compact Event; field values the hub cannot store
  (unknown enum values from newer clients, invalid dates, malformed JSON or
  tagIds) now get a winning virtual-device-0 clock so the pusher adopts the
  stored value instead of keeping its own forever; HLC state is written
  inside the transaction that used it; reorders assign new positions only
  to the rows that must move; replica writes and remote batches run in one
  transaction with one change notification; inflation checks and
  rebalancing stay inside SQLite and rewrite only the inflated run; and
  engine reads accept SQL prefilters (whitelisted fields) backed by new
  indexes, so active views and project counts no longer scan the whole
  Logbook.

## [0.6.2] - 2026-09-30

### Added

- **api/ui**: Later Projects (#113) — Someday projects and projects with a
  Scheduled Date later than today are now treated as one hibernating
  "Later Project" concept, following Things 3. A single pure predicate
  (`laterProjectKind` in `@taskora/shared`, fed the account time zone's
  today key) is the only decision point, so the sidebar, the new page, the
  area page and the task-view filters can never disagree; the state stays
  fully derived with no cascade writes, so waking a project brings its
  tasks back unchanged. The sidebar hides later projects entirely and
  collapses the no-area ones into a muted "N later projects" row pinned at
  the end of the standalone list, rendered outside the `SortableContext`
  (so it cannot be dragged or used as a drop target) and appearing only
  when N ≥ 1; area-owned later projects show only on their area page. A
  new `/later-projects` route (registered in all three shells) lists the
  no-area ones under "Scheduled" and "Someday" section headings, sorted by
  date then order and by order respectively, with no drag handles; the
  area page renders the same sections below its active projects and tasks,
  and keyboard selection now walks active projects → tasks → Scheduled →
  Someday via an explicit rank. Rows reuse `ProjectFeedRow`, and the plan
  section carries a date chip. Tasks inside a later project are excluded
  from Anytime and Someday (dated ones still reach Today / Upcoming,
  matching Things 3); the backend view predicate, the local engine's
  `taskMatchesView` and the event-stream matcher all learned the parent
  rule, the last so that changing a project's status, `scheduledType` or
  `scheduledDate` re-matches its tasks' queries. Sidebar reordering now
  serializes the full project order (visible items fill their old slots,
  hidden ones keep theirs) so hidden projects rejoin without number
  collisions; dragging a later project onto an area row changes only its
  area and never wakes it.
- **api/mobile/desktop**: Reminder notifications gained actions and task
  reveal (#112) — a reminder notification now offers Complete and Snooze
  (15 minutes / 1 hour / tomorrow) and its body reads
  `HH:mm · <project or area>`, appending the first line of the note and
  localizing every string through the `task` namespace, so the shells
  carry no translations. Tapping the body brings the app forward, expands
  the reminded task and routes to the view that can hold it (Today when
  visible there, otherwise its project, its area, or its bucket's list; a
  completed or trashed task only opens the app). Actions run through a new
  pure Reminder Action module: it discards a late action when the task is
  settled, trashed, gone, or its current reminder `fireAt` no longer
  matches the notification snapshot, applies Complete through the shared
  `completeTask` path with `settledAt = tappedAt` (so Logbook grouping and
  repeat-instance derivation stay correct), and applies Snooze as a plain
  `scheduledDate` + `reminderTime` rewrite that syncs like any other field
  edit; replays are idempotent. Android extends the repo-local reminders
  plugin (ADR-0014): the plan gains `taskId` and a JS-computed
  `snoozeTomorrowAt`, the notification exposes Complete / 15 minutes /
  Later… (a native dialog with 1 hour / tomorrow), and a receiver cancels
  or re-arms the alarm and appends the action to a persisted queue that JS
  drains on start and via an `actions-available` event — all without
  launching the app, so a killed process still completes or re-schedules
  on time. Desktop bypasses `tauri-plugin-notification` for sending: a new
  Rust `show_reminder` command posts buttons through
  `tauri-winrt-notification` (all four actions flat on Windows),
  `notify-rust` XDG actions on Linux and `mac-notification-sys` on macOS
  (Complete plus a snooze dropdown), emitting a `reminder-action` event
  after focusing the window; the plugin is kept only for permission
  commands.

### Changed

- **ui**: Project rows in list views were unified on `ProjectFeedRow`
  (#114) — the area page and Later Projects page now render the same row
  as the Today / Upcoming feeds (accepting either a `ProjectFeedItem` or a
  `ProjectResponseDto`), while `ProjectItem` is reduced to the sidebar's
  compact 28px row with its 16px progress ring. The area page drops its
  "Projects" and "Tasks" section labels, and section and heading titles
  render bold.
- **mobile**: The status-bar quick-add overlay now draws its own scrim and
  card on a fully transparent Activity and animates them in and out
  (#111) — a 150ms fade plus a decelerating slide-in, and a 120ms
  accelerating fade plus slide-out on dismiss, with the system task
  transition and the starting window disabled so closing the overlay no
  longer plays the "window shrinking back to the launcher icon" task
  animation. The scrim extends under the status and navigation bars, and
  the keyboard is requested on the next frame instead of after a 100ms
  delay.

## [0.6.1] - 2026-09-28

### Changed

- **ui**: Native date, time and repeat inputs replaced with custom
  pickers (#109) — the Reminder time drops `<input type="time">` for a
  new `TimePicker`: the trigger shows `HH:mm` and opens two scrollable
  columns (24 hours, 60 minutes) that center the current value, move
  focus with ↑/↓ and write on pick, on an opaque surface so the
  calendar underneath does not show through a translucent popover. The
  Repeat Rule panel swaps its native checkbox and `<select>` for a
  Switch plus a segmented unit control ("Every N" on its own line,
  unit as a `radiogroup`), and the repeat entry is removed from the
  expanded task row — the row's ↻ badge stays, but the context-menu /
  long-press item is now the only editor, since repeat is a set-once
  setting. In the date popover, Clear moves from a full-width footer
  row to a calendar ✕ icon at the end of the shortcut row, and the
  calendar tightens (28px day buttons and nav, smaller gaps, no footer
  separator).

### Fixes

- **api**: `Someday` labels were left untranslated in the Chinese
  locale (#110) — `task:somedayLabel` and `task:somedayEmpty` in
  `zh/task.json` still read "Someday"; they are now 「将来」 and
  「没有将来任务」.
- **desktop**: Launch-at-login was silently switched off by every
  manual upgrade (#108) — Windows NSIS runs the previous uninstaller
  without `/UPDATE` when installing a new package over an old one, and
  its uninstall section deletes
  `HKCU\...\CurrentVersion\Run`, so the login item vanished on each
  upgrade while the Settings toggle faithfully reported the system
  state. The shell now persists the user's intent in
  `app_data_dir/launch-at-login.json` and reconciles it against the
  system login item on startup: re-enable and refresh the executable
  path when the entry is missing, adopt the system state when there is
  no positive intent (old installs, re-enabling from system settings),
  and yield when Windows has the Run value but marks it disabled in
  Task Manager. Reconciliation is skipped in debug builds (dev and
  release share the login item name, so refreshing would point
  autostart at `target/debug`). Settings now call the shell's
  `launch_at_login_get` / `launch_at_login_set` commands; the
  `@tauri-apps/plugin-autostart` JS dependency and the
  `autostart:default` capability are removed. One-time caveat: the
  upgrade to this version is still cleared by the old uninstaller (no
  intent file exists yet), so the toggle must be turned on once more.
- **api/ui**: Past Scheduled Dates were pulled into today's Calendar
  cell (#107) — the calendar applied the "a past When counts as today"
  rule when grouping tasks, so overdue tasks were painted on today and
  vanished from the day they were actually planned; grouping now uses
  the stored date and the Calendar highlights today independently
  (re-rendering across midnight). The Things 3 semantics stay in the
  task card: a past date is shown as Today selected, the stored value
  is not rewritten, and turning on or changing a Reminder now writes
  the Scheduled Date as today as well, so the reminder is not anchored
  in the past and never fires.
- **api**: Remote profile edits stayed invisible until the local
  Settings form was saved (#106) — the shell avatar and display name
  read from `useAuthStore.user`, but `useCurrentUser` only hydrated
  preferences from the polled `/auth/me` response and never the user
  itself. The fetched profile is now mirrored into the store, guarded
  by a live token and a matching user id so a cached response cannot
  resurrect a cleared session.

## [0.6.0] - 2026-09-27

### Changed

- **ui**: Things 3-style visual language and shared design tokens across
  all three shells (#105) — the theme duplicated in every shell is
  consolidated into `packages/ui` (`styles/tokens.css` +
  `tailwind.preset.js`), which the shells now import. A new light/dark
  token palette (white canvas, gray sidebar, blue interaction color,
  semantic today/deadline/success/warning and per-bucket nav colors)
  replaces the old colors, the system font stack replaces Google Fonts,
  and a type scale is registered with tailwind-merge. Primitives are
  restyled (macOS-style glass menus, quieter buttons/inputs, iOS switch,
  hairline separators, a global reduced-motion fallback); task rows
  become 32px with a selection color, tag capsules and a Things-style
  checkbox whose completion holds briefly before collapsing (undoable
  during the hold, `useCompletionRhythm`); the expanded task becomes a
  lifted card with set fields as chips and unset fields as toolbar
  icons; sidebars use colored bucket icons, 28px rows and spacing
  instead of separators; group headers, project feed rows and one shared
  `EmptyState` (replacing five ad-hoc implementations) follow the same
  rules. Scheduled/deadline pickers gain a vertical shortcut list
  (today/tomorrow/someday, current value checkmarked) above the month
  calendar with a single full-width Clear; login/register/server-setup
  cards flatten to a borderless rounded-xl card. A final contrast and
  motion pass tunes tokens to WCAG AA (icons to 3:1) and routes
  durations through `--dur-fast`.
- **mobile**: Things 3-style navigation, dense calendar grid and
  Material settings (#104) — the bottom tab bar is replaced by a
  Things 3-style home list, and the scheduling/deadline/repeat/tag
  entries of an expanded task open as centered modal cards on narrow
  screens (`FieldPicker`) instead of anchored popovers, so the calendar
  is fully visible wherever the task sits; picking a day keeps the
  card open so a reminder can be set right away. The Calendar month
  view becomes a dense chip grid (10px chips and no in-cell checkbox on
  narrow, 12px with ellipsis on wide, `+N` overflow) where the whole
  cell is a button opening that day's full task list in a bottom sheet
  (a 28rem centered card on wide screens). Settings gain two-level push
  navigation with list rows and a Material (Android) treatment:
  back-arrow top bar with a left-aligned title, monochrome icons,
  leading radio buttons, primary-colored section headers, 16px/56px
  rows and a primary switch sized 52×32 on narrow screens.

### Fixes

- **api/mobile**: Android Reminder delivery moved into a repo-local
  native plugin (#103, ADR-0014) — JS stays the single source of
  Reminder rules and computes the whole desired plan (key, epoch
  `fireAt` in the account time zone, title, body), handing it over
  through one idempotent `sync(plan)` call; the new
  `packages/mobile/plugins/reminders` owns everything stateful: it
  persists the plan, diffs against its own copy, arms
  `setExactAndAllowWhileIdle` alarms, re-arms on `BOOT_COMPLETED`,
  `MY_PACKAGE_REPLACED` and every app start, posts the notification when
  an alarm fires, and manages the `reminders` channel and permission
  state. This removes root causes the previous JS call chain could not
  reach: `tauri-plugin-notification` 2.4.0 never persisted notifications
  created through `notify` (so nothing survived a reboot), silently fell
  back to inexact alarms without exact-alarm permission on Android 12+
  (firing up to an hour late), and the coordinator's in-memory
  `registered` map vanished with the process so alarms for Tasks
  completed, trashed or reminder-disabled elsewhere were never
  cancelled. Reminders missed while the device is off are dropped,
  matching the desktop rule. A new Reminder reliability settings
  section surfaces notification permission, channel state, exact-alarm
  capability and battery-optimization exemption with jumps to the
  relevant system pages (including OEM autostart screens). Desktop keeps
  its runtime scheduler and `tauri-plugin-notification`.
- **mobile**: The Android status-bar QuickAdd overlay pulled the whole
  app to the foreground (#102) — tapping "＋" opened the entry overlay
  but also brought the main activity forward, because the transparent
  `QuickAddActivity` defaulted to the app's main task and made the
  underlying MainActivity visible/resumed behind it. The activity now
  declares `android:taskAffinity=""` and `launchMode="singleTask"`, so
  the overlay lives in its own task and whatever app was in front stays
  behind it. The cold-start path (process killed, Tauri start brings
  MainActivity up) remains a known edge.

## [0.5.5] - 2026-09-27

### Changed

- **mobile**: Status bar notification switched to a single-line custom
  layout (#100) — the ongoing notification no longer uses the
  notification plugin's standard template (task title plus a separate
  system action row); a new in-repo Kotlin plugin
  `tauri-plugin-statusbar` (`packages/mobile/plugins/statusbar`, a path
  dependency modeled on `tauri-plugin-timer`) backs a `RemoteViews`
  layout with the single-line task title and two larger vector icon
  buttons, matching the TickTick form. A `specialUse` foreground
  service (`START_STICKY`) holds the notification and snapshots its
  content to `SharedPreferences` so a sticky restart can rebuild it;
  "▸" cycles to the next task through a manifest-registered receiver
  that forwards to JS via `plugin.trigger` (now returning early with
  `goAsync()` so the main activity is not pulled forward), and "＋"
  opens a translucent `QuickAddActivity` overlay whose submitted title
  reaches JS the same way (buffered in `SharedPreferences` and flushed
  on plugin load when the process was cold). The notification is no
  longer expandable (no `BigContentView`). The platform-agnostic
  `StatusBarShell` interface and controller are unchanged.

### Fixes

- **api/mobile**: Android Task Reminders could stay silent even with
  the app in the foreground (#98) — notification IDs were generated as
  unsigned 32-bit numbers while the plugin's Rust/native notification
  IDs are signed `i32`/`Int`, so some stable task IDs always overflowed
  and registration failed every time; IDs are now stable signed 32-bit
  integers (previously working positive IDs are unchanged). The
  scheduler's diff now distinguishes `due` (naturally elapsed) from
  `cancel` (rescheduled/disabled/terminal) so a naturally-due reminder
  on mobile no longer has its pending system schedule revoked; logout
  and stop still clear pending items, and the desktop runtime keeps
  firing at the due time. A shared `notification-bridge` now provides
  live native permission query/request and channel checks for both
  reminders and the status bar, refreshing permission state and
  rescheduling future reminders on return to the foreground.
- **desktop**: Notification permission was misreported as disabled and
  changes made in system settings were not picked up (#101) — the
  desktop shell now calls the native `plugin:notification|*` commands
  directly instead of going through the plugin's guest-js, whose
  `isPermissionGranted`/`requestPermission` read the session-local
  `window.Notification.permission` cache (on Windows that cache is
  initialized to `denied` at startup without querying the OS, so
  notifications fired fine yet the app always claimed they were
  disabled). Permission failures now return `false` instead of
  throwing, matching the mobile `notification-bridge` behavior.
- **ui**: Launch-at-login was shown on the mobile shell (#99) — the
  General settings tab only checked for `__TAURI_INTERNALS__`, but the
  mobile app is also a Tauri shell, so Android displayed a desktop-only
  toggle. The desktop check now also requires
  `getClientKind() === 'desktop'`.

## [0.5.4] - 2026-09-26

### Fixes

- **backend**: Runtime image was missing workspace package
  `node_modules` (#97) — the runtime stage copied only the root
  `node_modules` plus each workspace package's `dist` and
  `package.json`, so the per-package symlink trees that pnpm creates
  were absent: `@taskora/shared`'s `@js-temporal/polyfill` lives in
  `packages/shared/node_modules` (the root directory holds only the
  `.pnpm` store, since the root package has no dependencies of its
  own), so `require` resolve walked up past the package and failed at
  startup. The Dockerfile now also copies
  `packages/shared/node_modules` and `packages/engine/node_modules`
  into the runtime stage.

## [0.5.3] - 2026-09-26

### Added

- **api/backend**: Account time zone for calendar dates and reminders
  (#95) — Scheduled Date and Deadline are calendar dates, not instants,
  so new clients write `YYYY-MM-DD` (the REST DateTime columns keep
  encoding those dates at UTC midnight) and no reader applies the
  device offset anymore; this fixes "scheduled today + daily repeat
  produces another instance still on today", which came from mixing a
  local-midnight ISO with a UTC day key. An account-level IANA zone —
  initialized to the first device's zone and persisted with
  preferences, with a Settings entry to change it — now drives every
  calendar consumer: Today/Upcoming for tasks, projects and the event
  cache, the date quick-picks and calendar highlight, deadline
  countdowns, Logbook grouping and badges, completion-anchored Repeat
  Rules and their previews, reminder scheduling/wording and
  rescheduling on zone change, the Android status bar, the assistant's
  per-conversation current date, and export filenames. Legacy
  non-midnight values are decoded through a server-managed
  `legacyDateTimeZone` captured once at first initialization so old
  dates do not move when the setting changes (a UTC-midnight encoding
  is indistinguishable from a stored calendar date and keeps its UTC
  date); real instants (`createdAt`/`updatedAt`/`settledAt`/`trashedAt`,
  token expiry, sync HLC) stay absolute. Date math is pure and takes
  the zone explicitly — servers never use their own local zone. See
  [ADR-0013](docs/adr/0013-calendar-dates-and-account-time-zone.md).

### Changed

- **ui**: Full-screen settings panel on mobile (#93) — below the
  desktop breakpoint settings now open as a full-screen page (title bar
  with a top-right close button, horizontal tab strip, content scrolls
  the panel) instead of a cramped centered modal; a new `useMediaQuery`
  hook picks the layout, the dialog gains a `mobileFullscreen` variant
  that drops the centering transform and stretches to the viewport, and
  the panel height follows `--kb-inset` so the keyboard keeps the
  focused field visible, with safe-area padding for the notch and home
  indicator. The desktop centered modal with its left nav column is
  unchanged.
- **mobile**: Full-bleed Android launcher icons (#92) — a new
  `scripts/generate-android-icons.py` renders adaptive-icon
  foreground/legacy/round mipmaps across all five densities so the
  artwork fills the launcher mask instead of sitting in a padded
  square, with `scripts/sync-android-icons.mjs` wiring it into the
  sync step.

### Fixes

- **mobile**: Android status bar notifications never appeared (#94) —
  with the toggle on, the notification was missing from the shade
  because the locked `@tauri-apps/plugin-notification@2.4.0` calls
  `plugin:notification|listChannels` while the default ACL only allows
  `list_channels`, and Tauri checks the ACL before its camelCase
  conversion, so channel setup was rejected; the shell swallowed that
  error, cached the channel as ready and kept posting to a
  non-existent channel, while `sendNotification()`'s void return made
  the failure uncatchable. The mobile shell now uses a narrow shared
  bridge with the ACL-correct `list_channels` plus an awaitable
  `notify` command (same fix for the Reminder shell, no ACL widening
  and no dependency change), channel/action init failures are no
  longer cached and propagate, enabling now awaits the post and rolls
  the toggle back with a "check system notification settings" toast on
  failure, and regression tests exercise the real plugin JS API at the
  IPC boundary instead of mocking the shell.
- **desktop**: Reminder notifications were silent (#96) — the desktop
  notification shell never passed a `sound`, and
  tauri-plugin-notification turns a missing sound into notify-rust's
  `sound_name: None`, which is not "let the OS decide": winrt then
  writes `<audio silent="true"/>` on Windows and mac-notification-sys
  writes an empty soundName on macOS, so the toast appeared without a
  sound. `fireNow` now passes the platform's default-sound literal
  ("Default" for the winrt enum on Windows, "default" — the value of
  `NSUserNotificationDefaultSoundName` — on macOS; Linux is left
  untouched because notify-rust's XDG backend ignores `sound_name`),
  pinned by a shell test.

## [0.5.2] - 2026-09-26

### Added

- **mobile**: Android status bar quick add + pending tasks (#84) — a
  TickTick-style ongoing LOW-importance notification showing today's
  open tasks one at a time, with "＞" to cycle to the next task
  (cursor persisted across cold starts) and "＋" to quick-add via
  inline RemoteInput; the zero-task state shows a quick-add entry.
  Platform-agnostic content (sort/overdue prefix/carousel title) and
  the controller (cursor + debounce + session follow) live in
  @taskora/api/status-bar, the tauri-plugin-notification shell in
  @taskora/mobile/status-bar, with a Settings toggle (Android only)
  that walks the notification-permission flow, and an engine
  onChange hook refreshing content debounced.

### Changed

- **ui**: Task ownership renders as a subline below the title (#91)
  — the project/area tag moves from the right end of the task row to
  a muted line beneath the title, matching Things 3's two-segment
  row; rows with an owner grow naturally while ownerless tasks keep
  the compact single-line height, and ownership is now visible on
  mobile too. Grouped views keep group rows free of ownership tags
  (the header carries the context).
- **ui**: Past scheduled dates are treated as today, never overdue
  (#88) — When semantics aligned with Things 3: a scheduled date is
  a plan-to-start day, never a due date, so it can never go
  "overdue". Dates on or before today render a yellow star (Things 3
  Anytime semantics) across task rows, project rows and group
  headers; the red overdue date chip is gone and red urgency is now
  exclusive to deadlines. The calendar rolls past date keys into
  today so those tasks land in today's cell, and CONTEXT.md
  documents the Scheduled Date term.
- **ui**: Grouped View flattened to a single level with
  section-title headers (#85) — the nested area > project > task
  hierarchy is replaced by flat single-level groups: tasks join
  their direct parent's group only, so in-area project tasks cluster
  under the project header as a sibling of the area group. Group
  headers become lightweight underlined section titles (bold title +
  2px underline) with no collapse affordance — the collapse store,
  chevron buttons, bare ←/→ keymap actions and collapsed-group drop
  toast are removed. Group order follows the sidebar's global visual
  order; project headers keep the progress ring, date badges,
  context menu and detail navigation, and header rows stay droppable
  (drop lands at group end).
- **ui**: Task/project row alignment and settled styling cleanup
  (#90) — the task checkbox is wrapped in a 20px slot matching the
  project progress ring so task and project titles align in mixed
  lists; the cancelled checkbox now uses the same theme-color fill
  as completed, distinguished only by the X icon; strikethrough is
  reserved for cancelled across task rows, subtasks, calendar cells
  and project rows (completed titles are muted only); logbook
  entries drop the muted gray on titles.
- **ui**: Task checkbox reshaped to a rounded square (#87) — the
  circle becomes a rounded square, default size 18px → 14px
  (calendar compact override 12px), and the project progress ring
  grows 18px → 20px to match.

### Fixes

- **mobile**: Android reminders never fired — registration failures
  are now surfaced and self-heal (#83) — the failure chain was fully
  silent: sendNotification rejections escaped un-awaited, channel
  creation failures were cached for the whole session, and the
  coordinator recorded failed registrations as done so nothing ever
  retried. The mobile shell now awaits, logs and rethrows
  sendNotification failures, retries channel creation, and
  pre-checks permission; the coordinator no longer marks failed
  registrations as done, so the periodic tick retries and recovers
  once permission/channel are restored, without relying on data
  changes or an app restart. The desktop shell likewise awaits and
  logs fireNow failures.
- **calendar**: Cancelled task rows render with settled styling
  (#86) — calendar rows only handled COMPLETED, so cancelled tasks
  showed a plain open checkbox and a non-struck title, and clicking
  the circle completed them instead of uncancelling. Cancelled rows
  now get the muted X checkbox and struck-through title per
  ADR-0006, and clicks route through uncancel, consistent with the
  Logbook.
- **logbook**: Settled date renders in theme color instead of the
  scheduled date chip (#89) — planned-date chips no longer leak into
  settled rows, settled tasks are exempt from the overdue exception
  that force-rendered a red chip, and the settled date renders at
  the row-leading chip position in the theme primary color for both
  task and project rows.

## [0.5.1] - 2026-09-25

### Added

- **ui**: Grouped View for the time views (#81) — Today/Anytime/Someday
  tasks now group under their direct parent (project/area) with
  collapsible group headers (chevron, progress ring, badges, counts)
  following sidebar order; loose tasks float at the top and orphaned
  tasks (settled/trashed/missing parents) stay ungrouped with their
  parent tag. Grouping is a pure render-layer derivation over the
  unchanged flat feed. Collapse state persists device-locally per view
  per parent (never synced); within-group reorder writes back the
  global Position, cross-group drop reassigns projectId/areaId, and
  dropping on a collapsed group lands at its end with a confirming
  toast. Keyboard support follows ADR-0004: ←/→ collapse/expand
  headers, j/k traverse visible rows only, Alt+↑/↓ clamp at group
  boundaries, Space on a header creates the task in that parent.
  Settings → General gains a synced "group tasks by project/area in
  time views" toggle (default on), and the General tab now renders on
  web too.
- **logbook**: Logbook redesigned after Things 3 (#82) —
  progressive-granularity groups replace the flat
  today/yesterday/earlier buckets: today/yesterday as relative labels,
  the current week as full weekday names, earlier full weeks of this
  month as week ranges, then earlier months of the year, then years —
  a bounded group count keeps long history scannable. Settled dates
  render inline next to the title on both task and project rows (with
  year when crossing years), and cancelled project rows render
  consistently (X progress ring, struck-through dimmed title) —
  presentational only, per ADR-0006.
- **ui**: Notes & subtasks badges on collapsed task rows (#71, #79) —
  a sticky-note icon when notes are present and a list icon with the
  open-subtask count, pinned in the title cluster next to the title
  (Things 3 style) and hidden when empty.

### Changed

- **ui**: Things 3-style date display on task rows (#78) — the
  scheduled date moves from a trailing calendar-icon badge to a
  leading date chip between checkbox and title (rounded muted capsule
  with a short absolute date, red when overdue/today); the Today view
  omits the chip since the list itself is the date context, but
  overdue tasks keep a red chip. The repeat-rule icon moves to the
  leading slot next to the chip. The deadline badge switches from a
  Clock icon with an absolute date to a Flag icon with a countdown
  ("x days left" / red "today" / red "x days past due"), so the text
  format itself distinguishes plan-to-start from must-finish; project
  meta rows follow the same flag + countdown style, and CONTEXT.md
  gains a Deadline entry recording the distinction.
- **ui**: Project/area reassignment consolidates into a "Move" entry
  in the task context menu (#75) — the Project and Area icon buttons
  leave the expanded task row; the move picker lists areas and
  projects side by side in one panel, with a "None" row per section
  to clear the assignment.

### Fixes

- **mobile/desktop**: Cold start no longer blocks on session refresh
  (#73) — boot awaited the `/auth/refresh` server round-trip (up to
  the 15s timeout on weak networks) before resolving, stacking a
  network wait on top of the WebView cold start even though the
  local-first replica already has everything needed to render. With a
  persisted user snapshot and hydrated session, boot now resolves
  immediately and refresh runs in the background (401 still clears
  the session and switches to login; network failures fall back to
  offline mode with the sync indicator). Both shells share the same
  startup semantics, with boot tests added per shell.
- **backend**: Parse `repeatRule` in change event payloads (#80) —
  `buildPayload` passed the raw Prisma row through for task events,
  leaving `repeatRule` as a TEXT JSON string instead of the parsed
  object every other read path returns; the SSE event then overwrote
  the client's task cache with the string, so the repeat rule editor
  bounced the toggle off and disabled all controls. The event payload
  now mirrors the HTTP read path, locked by an integration regression
  test.
- **ui**: Cancelled tasks render with an X checkbox mirroring the
  completed style (#76) — filled shape with an X instead of a
  checkmark, muted tones, and the pop animation; the old outlined
  circle-slash was visually indistinguishable from the unchecked
  state at 18px.
- **ui**: Fix calendar size and selected/hover styles (#74) —
  react-day-picker v10 applies modifier classes (selected/today/
  outside/disabled) to the outer `td` rather than the day button, so
  the round selected background rendered as a skewed rounded
  rectangle layered over the button's own hover background. A custom
  DayButton now carries the visual states on the button itself, the
  today dot anchors to the button, and the calendar shrinks one notch
  (day buttons size-9 → size-8, mobile size-10 → size-9, still ≥36px
  touch targets).
- **ui**: Show reminder & repeat rule sections in the task context
  menu date picker (#70, #72) — the context menu's ScheduledDateField
  was opened with default props that hid the reminder time and repeat
  rule sections the expanded task row shows; the repeat rule editor
  was extracted into a standalone field entry so both entry points
  render the full editor.
- **ui**: Keep task rows rounded while the selection fades out (#77)
  — `rounded-lg` was only applied in the selected/expanded states, so
  the corner radius vanished instantly when a row switched back to
  idle while the background kept fading for ~150ms, briefly flashing
  a square-tinted block; the radius is now always present.

## [0.5.0] - 2026-09-23

### Added

- **recurring-tasks**: Repeating Tasks — attach a Repeat Rule to a
  scheduled Task (unit day/week/month/year × interval N, optional weekday
  pattern for week rules, "after completion" anchor option, optional
  `until` end date). Completing a repeating Task immediately derives the
  next occurrence: a plain Task carrying the same rule, landing in
  Upcoming (future) or Today (overdue), with title/notes/tags/reminder/
  placement copied and subtasks reset to active. Multi-device concurrent
  completion converges on exactly one next instance via deterministic id
  derivation (`hash(parentTaskId, canonicalRule, occurrenceDate)`,
  ADR-0012) — the sync hub stays a dumb merger with zero business-logic
  changes. Rule edits fork the chain by design; cancelling ends it;
  moving to Someday/None clears the rule; settling keeps it for Logbook
  provenance; un-completing deletes the derived instance. The rule
  editor lives in the scheduling popover (visible only for date-
  scheduled Tasks, never Projects) with a live "next occurrence"
  preview; Task rows show a ↻ badge. Web clients get the same editor
  with server-side derivation on the REST complete path.
- **reminders**: Task reminder times — set a time-of-day (HH:mm)
  reminder in the scheduling popover while a Task is scheduled to a
  date. Desktop fires the notification from a runtime scheduler while
  the app is running (missed ones are silently dropped, never replayed);
  mobile registers system-level scheduled notifications via
  `tauri-plugin-notification` that fire even when the app is closed.
  Reminder data is a new `reminderTime` field on Task that syncs through
  the existing field-level HLC last-write-wins merge; Projects do not
  support reminders. Reminders are cleared automatically when a Task is
  settled (completed/cancelled), trashed, or moves off a scheduled date;
  moving to another date keeps the reminder time. Permission is
  requested on first reminder enable (not app launch); if denied, the
  time can still be saved with an in-popover notice and a jump to
  system notification settings. Task rows show a clock + HH:mm badge,
  and the web frontend hides the reminder section entirely this version.

## [0.4.6] - 2026-09-22

### Added

- **mobile**: Android app (#63) — the third thin shell alongside
  web/desktop (ADR-0010): a Tauri v2 app reusing `@taskora/ui` pages and
  the `@taskora/engine` local replica. Full parity — Areas / Projects /
  Tasks / Tags / Buckets / calendar / search, offline capture with the
  full local replica, foreground sync (startup pull, post-write push,
  foreground-resume pull, pull-to-refresh), the Android back-gesture
  cascade (overlay → history back → app exit), keyboard avoidance, and
  system-bar insets handling with theme-matched strips. Login tokens are
  stored as plaintext JSON in the app-private directory (ADR-0011 — the
  ADR-0009 Keystore JNI bridge crashed on real-device login and was
  removed; the Linux sandbox still shields unrooted devices).
  Distribution: signed arm64-only APK published to GitHub Releases on
  `v*` tags (`android-release.yml`, signing setup in
  `scripts/android-signing.py`); sideload instructions in the README
  (bilingual). Version carriers (package.json / tauri.conf.json /
  Cargo.toml) bumped with the monorepo via `release.mjs`.
- **api**: `ClientKind: 'mobile'` (X-Client header) — the backend
  refresh flow accepts mobile alongside desktop for the body-based
  refresh-token exchange (`isNonCookieClient`).

## [0.4.5] - 2026-09-21

### Added

- **ui**: Hover hints on the expanded task row's field icon buttons
  (date, due, project, area, tags) (#57): sibling buttons (add/delete
  subtask) already had tooltips while the five field triggers showed
  none. The IconPopover trigger is now wrapped in `Hint` inside
  `TaskRowExpanded`, with the label sourced from the same i18n key as
  the button's `aria-label`; Radix Tooltip closes its content on
  trigger click/pointerdown, so the hint does not linger behind the
  opened popover.

### Changed

- **deps**: Pin TypeScript to 5.9.3 via `pnpm-workspace.yaml` overrides
  (#55): i18next v26 declares typescript as an optional peer, and the
  lockfile resolved typescript 5.8.2 for `packages/frontend` but 5.9.3
  for `packages/api` and friends, so pnpm created two distinct
  peer-variant copies of i18next/react-i18next — `@taskora/api`
  initialized one copy while `Login.tsx`'s `useTranslation()` read from
  the other (uninitialized) copy, rendering raw keys ("auth:login") on
  the web/desktop login pages. A Login i18n smoke test now fails when
  raw keys are rendered.
- **ci**: Align CI's pnpm with the lockfile-generating pnpm 11 (#55):
  CI installed pnpm 9, which does not read overrides from
  `pnpm-workspace.yaml`, so it saw an empty overrides config that
  mismatched the lockfile's recorded override and failed with
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on `--frozen-lockfile`. A
  `packageManager` field (pnpm@11.17.0) is now the single source of
  truth and the hardcoded `version: 9` was dropped from the workflows
  so `pnpm/action-setup` reads the version from package.json.

### Fixes

- **ui**: Touch support for row context menus, drag reorder, and
  agent/calendar layout (#56): row context menus (task/project/subtask)
  were mouse-only (`onContextMenu`), so touch devices could not delete,
  cancel, move, or restore rows — a `useLongPress` hook (touch/pen only,
  500ms hold, 8px tolerance, click suppression after firing) now opens
  them via a shared `openMenuAt(x, y)` virtual-anchor path. The
  `/agent` (full-bleed) and `/calendar` (canvas) `h-full` containers
  were occluded by the fixed MobileTabBar on small screens —
  `MainContent` gains `max-md` bottom padding (3.5rem + safe-area
  inset). Drag reorder used `PointerSensor(distance: 5)`, so touch
  scrolling 5px hijacked the list into a drag and the heading drag
  handle was hover-only (invisible on touch) — five DndContexts
  (TaskList, FeedListView, AreaDetail, ProjectTaskLayout,
  SidebarProjectSection) switch to `MouseSensor(distance: 5)` +
  `TouchSensor(delay: 300, tolerance: 8)`, and the heading handle is
  visible with `max-md:opacity-100`.
- **ui/desktop**: Restore title auto-focus when creating projects,
  areas, and tasks (#58): creating a new project/area while already on
  another detail page left the title as a static `<h1>` instead of the
  auto-focused empty input — the route change only swaps params, React
  Router reuses the page component, and `InlineTitleEdit`'s
  `useState(autoFocusAndSelect)` initializer never re-runs; it now
  enters edit mode when `autoFocusAndSelect` turns true while mounted
  (mirroring `ProjectHeadingRow`), covered by a desktop-shell test
  (MemoryRouter + Suspense + lazy pages, StrictMode, engine cache
  replacement). Additionally, creating a task on the project/area page
  left the expanded row's title input unfocused: `useCreateTask`
  invalidated and replaced the optimistic temp row before the mutation
  resolved, then `onSuccess` blindly prepended the real row again —
  React's dedupe reconciliation unmounted the focused expanded row;
  the create `onSuccess` now dedupes against concurrent cache updates.
- **ui**: Clamp long sidebar titles instead of spilling past the panel
  (#60): Radix ScrollArea's viewport wraps content in a shrink-to-fit
  `display: table` div, so a long project title's min-content inflated
  the wrapper (~721px), pushed past the viewport, and got hard-clipped
  without ellipsis — the shared ui ScrollArea overrides the wrapper
  back to `display: block`. SidebarAreaRow / CollapsibleSection title
  NavLinks were flex items with `min-width: auto`, forcing rows wider
  than the sidebar — they gain `min-w-0` so the inner truncate span
  measures correctly (verified with a vite+playwright geometry harness:
  53 overflowing elements before, 0 after).
- **ui/desktop**: Tame sidebar auto-scroll so edge-zone project drags
  land correctly (#59): sidebar project drags inside the Radix
  ScrollArea ran away whenever the dragged item sat in the bottom 20%
  of the scroll viewport — dnd-kit's default autoScroll (20% threshold,
  5ms interval, acceleration 10) spun the list at ~2000px/s, sweeping
  the placeholder through the whole column and committing the drop to
  a neighboring area or the list end. The edge threshold narrows to one
  row (~6%), the scroll slows (acceleration 4, interval 20ms) so edge
  drags keep a gentle auto-scroll, and the parameters are locked with a
  regression assertion.
- **ui**: Save and collapse task on plain Enter in the title input
  (#61): pressing Enter while focused on an expanded task's title input
  previously only blurred it to commit the edit, requiring a second
  Enter after focus returned to the row to collapse — the plain-Enter
  path now merges with the Cmd/Ctrl+Enter path so both blur to commit,
  hand focus back to the row, and collapse the expansion in one step.

## [0.4.4] - 2026-09-21

### Fixes

- **api**: Add the missing `getFeed` to the REST task backend — the web
  feed rendered "load failed" (#53): the feed query hook calls
  `currentTaskBackend().getFeed(view)`, but the REST module (the default
  backend on web) never implemented it; the `TaskBackend` interface was
  satisfied via an unchecked `rest as TaskBackend` cast, so the gap only
  surfaced at runtime as `getFeed is not a function` → react-query
  `isError` → "加载失败". `getFeed(view)` now calls the existing
  `GET /feed?view=...` endpoint, and the `as TaskBackend` casts are
  replaced with structural assignment so future missing members fail at
  compile time.
- **sync**: Dual-write position/sortOrder in every reorder path (#54):
  desktop drag-reorder inside a project silently bounced back while the
  web client showed the new order, because the two surfaces read
  different sort keys (replica: fractional-indexing `position`; web:
  `sortOrder asc, createdAt desc`), and once a device wrote a real
  position a reorder touching only `sortOrder` stopped affecting the
  desktop (the mirror bug froze the web for position-only writes).
  `synthPosition` moved into `@taskora/engine` so written and
  synthesized positions never diverge; `positionAfter` falls back to
  synthesizing from `sortOrder`+`createdAt` instead of "insert at
  front" when a neighbor has no position; engine backends and the REST
  reorder endpoints (tasks/projects/project-headings) now write both
  keys in the same transaction.
- **sync**: Poison-pill defense, completed compact cascades (#54): a
  device writing offline could reference an entity physically deleted
  (compacted) elsewhere — the hub's merge hit a foreign-key violation,
  failed the whole push batch, and the device replayed the same poison
  batch forever (stuck at "offline, N pending"). The hub now scrubs
  dangling references before merge (array refs drop dead ids, scalar
  refs null out per compact `SetNull` semantics, a dead subtask drops
  the whole event) with a three-state alive/dead/pending probe that
  preserves forward references within the same batch; scrubbed values
  carry a virtual-device-0 clock that wins over the pushing device's
  HLC so the echo actually applies. Tag compaction scrubs `tagIds` in
  replicas as well as hub relation rows; `removeRows` reports every
  affected entity (cascade children, SetNull hosts, `tagIds` hosts) so
  UI caches invalidate correctly; `DELETE_CASCADES` gains
  project → project-heading, `COMPACT_NULL_REFS` gains
  project → task.projectId, and the hub broadcasts cascaded compacts
  per entity (emptyTrash registers and broadcasts heading compacts —
  orphan headings no longer survive forever).
- **sync/desktop**: Keep the local-first desktop app usable offline
  after restart (#54): boot's `refresh()` failure previously surfaced a
  retry screen instead of the main window, and without a hydrated user
  there was no `userId` to open the per-user replica — offline only
  worked within a running session. Boot now mirrors a
  preferences-free user snapshot to WebView storage (tokens stay in the
  secure store) and, on network failure with a snapshot available,
  keeps the hydrated user and starts offline (the sync indicator shows
  offline state); 401 still signs out and a no-snapshot first-run keeps
  the retry screen. `syncNow` reports success, and a first sync failing
  on an empty replica (cursor 0) retries with 2s→15s backoff until the
  bootstrap lands instead of rendering empty data.
- **sync**: Align remaining replica semantics with REST (#54):
  `updateTask` clears `headingId` when `projectId` changes (a task
  moved to another project previously reappeared under the old
  project's heading when moved back); `restoreProject` (both surfaces)
  only revives tasks trashed by the project cascade (same `trashedAt`
  timestamp), leaving independently deleted tasks in the trash;
  `getProjectHeadings` sorts ties by `createdAt asc` matching
  `ProjectHeadingsService`; `useReorderTasks` optimistic update only
  reorders lists fully covered by the submitted ids.

## [0.4.3] - 2026-09-20

### Fixes

- **sync**: Make a device's own echo idempotent — no more UI flash
  after "create task syncs": `SyncHubService.applyEvent` stored
  `fieldDigests` computed from the _pushed_ wire values, while the
  persisted columns diverge from them (`updatedAt` override,
  non-nullable columns taking Prisma defaults such as `sortOrder`
  null → 0, `tagIds` read back sorted from the relation table).
  `serializeRow`'s digest check therefore misread the hub's own merge
  write as a REST bypass and reset the field clocks to virtual device 0
  at the row's `updatedAt` — the device then pulled its own echo back
  with _newer_ clocks, applied it, fired `onChange`, and invalidated
  every query root (the "refresh flash" ~1s after creating a task).
  Digests are now backfilled from the row's wire view after the merge
  write (with an explicit `updatedAt` so `@updatedAt` cannot bump it),
  `updatedAt` is only synthesized when the patch omits it (device
  values persist verbatim, so tied-clock echoes no longer diverge),
  and the device replica normalizes `sortOrder`/`tagIds` writes to the
  same persisted-column semantics. The in-memory test hub now models
  the same normalization, with echo-idempotency regression tests at
  both the harness and real-Postgres seams.
- **desktop**: While the local-first Engine is active, the Event Stream
  (SSE) is now purely a "something changed, pull now" trigger: the
  legacy cache-surgery applier is disabled (it double-invalidated on
  every echo and reordered lists by the REST-era `sortOrder`/
  `createdAt` authority, fighting the replica's `Position` ordering);
  it is re-enabled when the engine stops or fails to assemble (REST
  fallback). Engine change notifications now carry origin + entities,
  so the desktop invalidates only the affected query roots and only
  local writes schedule the debounced sync (applying remote changes no
  longer chains a pointless flush/pull).
- **ui**: `useCreateTask` optimistic insert now prepends, matching both
  backends' newest-first list semantics (REST: `createdAt desc`;
  Engine: head `Position`) — the real task no longer jumps from the
  bottom to the top of the list after refetch.

## [0.4.2] - 2026-09-20

### Fixes

- **sync**: Reject nothing on sync push — repair `PushRequestDto`
  validation (#49): the global ValidationPipe (whitelist +
  forbidNonWhitelisted) rejected every legal `POST /sync/push` request
  with 400 — `OutboxEventDto.fields` was mislabeled `@IsArray()` although
  fields is a Record (field name → `{ value, hlc }`), and
  `PushRequestDto`'s nested arrays lacked `@Type`, so class-validator
  could not resolve the nested metatypes. The desktop client therefore
  never managed to flush its Outbox, showing a permanent
  "offline · N pending" status despite healthy network and server
  (login/pull/bootstrap were unaffected). `fields` is now typed
  `@IsObject()` reusing `OutboxEvent['fields']` from `@taskora/engine`
  so DTO and protocol stay a single source of truth, nested arrays
  carry `@Type(() => OutboxEventDto)` / `@Type(() => DeleteRequestDto)`,
  and a regression test runs the real pipe config against a genuine
  engine payload.

## [0.4.1] - 2026-09-20

### Fixes

- **desktop**: Restore startup session recovery on v0.4.0: Tauri's
  `Builder::setup` and `Builder::invoke_handler` have replace semantics,
  so the `sqlite::install(builder)` call added in #48 silently discarded
  the tray setup and the `session_read` / `session_write` command
  registrations — `invoke('session_read')` rejected at startup and the
  app showed "session restore failed" forever (both retry and clear hit
  the same missing command, leaving session.dpapi untouched; the tray
  was also lost, so a hidden main window was reachable only by
  relaunching). Registration is now a single point: `sqlite.rs` gains
  `manage_state(app)` called from lib.rs's single setup, and one
  `invoke_handler` registers all six IPC commands. Linux CI compiled
  fine because the override only manifests at runtime.

## [0.4.0] - 2026-09-20

### Added

- **sync**: Local-first sync engine with Sync Hub and SQLite replica
  (#46, ADR 0007): a new `@taskora/engine` package provides the HLC
  hybrid logical clock, fractional-indexing positions, a field-level LWW
  merger shared by device and hub, and a reactive SQLite LocalReplica
  whose local writes enter an Outbox (pending edits survive restarts
  and merge on sync); the backend runs a Sync Hub (device registry,
  `POST /sync/devices`, `POST /sync/push`, `GET /sync/pull`,
  `GET /sync/bootstrap`) where REST and Assistant writes enter the same
  merge stream as virtual device 0, with field digests so REST writes
  never collateral-drop concurrent device edits on other fields; the
  desktop client runs Inbox/Today task CRUD on the engine.
- **desktop**: Full offline via delete requests and domain backends
  (#47, ADR 0008): a Delete Request primitive queues deletions in the
  Outbox with compact-wins convergence and local cascade cleanup;
  per-domain Engine backends (task, subtask, project, area, tag, tag
  group, project heading) replace REST calls after login (REST
  fallback on logout/failure) so every desktop entity works offline;
  quick-add relays through the main window's engine, and a sync-status
  store drives a SyncIndicator (synced / syncing / offline with
  pending count).
- **desktop**: System tray with Show Taskora / New Task / Quit entries:
  closing the main window now hides to the tray on every platform
  instead of exiting on Windows/Linux, so the global quick-add
  shortcut keeps working; re-open via tray, Dock icon or a second
  launch, exit via the tray's Quit entry.
- **desktop**: Main-window size and position are remembered across
  launches (tauri-plugin-window-state, quick-add denylisted, visibility
  not restored so fresh starts always show the window).

### Changed

- **desktop**: The Local Replica SQLite database is now per-user
  (`taskora-<userId>.db`) instead of a single shared `taskora.db`:
  switching accounts no longer leaks the previous account's sync
  cursor and queued Outbox edits. The legacy single-user database is
  migrated once (copied) for the first account that signs in and then
  renamed to `taskora.db.legacy`; other accounts start from a fresh
  replica.

### Fixes

- **desktop**: Stop the stale-query refetch on WebView resume from
  reintroducing the foreground flash (#45): `refetchOnReconnect` is now
  disabled in the desktop and frontend query clients — the Tauri
  WebView resume fired the browser `online` event and refetched every
  stale query, recreating the loading-state flash; the SSE reconnect
  with `?since=` replay, gap detection and resync signal remain the
  backstop.

## [0.3.6] - 2026-09-19

### Changed

- **desktop**: Drop the custom-drawn title bar and return to native
  window decorations. Removes `TitleBar.tsx` (drag region +
  Windows/Linux min/max/close buttons + macOS traffic-light inset),
  the in-flow shell wrapper and its `--titlebar-h` / `height: 100%`
  CSS compensations, and the `titleBarStyle: Overlay` +
  `set_decorations(false)` setup; the main window now shows the
  platform-native title bar and the shared `h-dvh` layout works
  unmodified, same as the web app. Quick-add remains a borderless
  popup, and the window capability list is trimmed to what the
  frontend still invokes.

## [0.3.5] - 2026-09-19

### Fixes

- **desktop**: Rework the custom title bar into an in-flow shell layout
  (#43): the title bar was a fixed overlay (top-0 z-50) while the shared
  AppShell still laid out from y=0, so the first 38px of the main view sat
  under the bar, blurred by the backdrop with clicks swallowed by the drag
  region; the old CSS calc(100dvh - titlebar) compensation never pushed
  content down. The desktop entry now wraps TitleBar + App in a flex
  column (h-dvh + flex-1), the bar becomes a normal flow header, shared
  layouts fill their parent (height: 100%) instead of the raw viewport,
  and Toaster gets a top offset so toasts drop below the bar. macOS
  (Overlay style + 78px traffic-light inset) and the quick-add window are
  unchanged.

## [0.3.4] - 2026-09-19

### Features

- **tasks**: Add the CANCELLED terminal state with a single settledAt
  column (#42, ADR 0006): the physical completedAt column is renamed to
  settledAt (zero data migration) while the API field keeps the
  completedAt name carrying Settled At semantics; symmetric
  cancel/uncancel endpoints for tasks and subtasks; terminal states
  rewrite each other directly and reopen returns to ACTIVE; Logbook
  and the project completed panel list both endings; keyboard parity
  with complete (Opt+Cmd+K / Ctrl+Alt+K / Alt+Shift+K) plus context-menu
  entries and slashed-circle struck-through rendering for cancelled
  rows; the settled-status whitelist lives in @taskora/shared so the
  backend and frontend ports cannot drift; restore from trash always
  returns a task to ACTIVE.
- **sync**: Per-user Event Stream push sync (ADR 0005) (#38): a Prisma
  interceptor collects change events per transaction and a per-user
  ChangeEventHub (monotonic seq, 500-event replay ring) serves them over
  GET /events SSE with ?since= replay, 25s heartbeat and a resync signal;
  the client applies events directly onto the React Query cache through
  a client-side port of the task view/filter semantics (detail merges,
  derived-cache invalidation, ~50ms coalescing), reconnects with backoff
  and gap detection, and refreshes on 401; refetchOnWindowFocus is off
  in frontend and desktop, removing the foreground flash.
- **backend**: Exclude projects from the inbox and anytime feeds (#41):
  resolveBucket falls back to ANYTIME instead of INBOX, the schema
  default changes to ANYTIME with a data migration, projects only
  surface in today/upcoming/someday/logbook/trash, and the agent
  update_project tool no longer accepts the INBOX bucket.
- **ui**: Calendar-based due date picker with single-click selection
  (#37): DueDateField now uses the shared Calendar (react-day-picker)
  with Today/Clear quick actions, locale and weekStartsOn support,
  auto-closing on apply at every call site; shared calendarFieldUtils
  drops the duplication with ScheduledDateField and the Calendar
  styling gets a pill-shaped selected day and clearer today marker.
- **ui**: Show inbox and today item counts in navigation (#40): pill
  badge on the mobile tab bar (capped at 99+) and Things-style count at
  the end of the sidebar rows, derived from existing feed queries with
  no extra requests.
- **ui**: Project metadata badges in the project detail header (#36):
  a ProjectMetaRow renders scheduled date, due date and tag badges
  (destructive color when overdue/today) that open popovers reusing the
  task field editors; field components move to structured prop types
  shared between Task and Project.
- **ui**: Custom scrollbars matching the Things3 theme (#39): thin
  rounded thumbs that are nearly invisible at rest and darken on
  hover/active, deriving colors from --foreground so themes adapt;
  Firefox uses scrollbar-width/scrollbar-color, Chromium/WebKit use
  ::-webkit-scrollbar with 6px visual thumbs.
- **desktop**: Custom-drawn title bar replacing the native window
  frame (#35): the main window starts hidden and is shown after
  per-platform decoration handling so no native frame flashes; macOS
  keeps the native traffic lights over an Overlay title bar with a
  drag strip; Windows/Linux draw the title plus Windows-style
  minimize/maximize/close controls in a full drag region with
  double-click maximize; layout height rebases to
  calc(100dvh - var(--titlebar-h)) in the desktop build only.
- Replace the app icon with a new design across all platforms.

## [0.3.3] - 2026-09-18

### Features

- **ui**: Icon-only buttons now reveal a Things-style hint tooltip on
  hover and keyboard focus (#34): the action label plus the
  platform-aware shortcut (⌘N / Ctrl+N / Alt+N) sourced from the keymap
  registry, so displayed keys always match the actual key bindings
  (ADR-0004). Adds a Radix-based Tooltip primitive and a `<Hint>`
  component; wired into ContentBottomBar, SidebarBottomBar settings,
  Calendar prev/next, Agent new-conversation/chat send, and
  TaskRowExpanded add/delete-subtask buttons (menu triggers skipped to
  avoid tooltip/menu visual collision).

### Fixes

- **keyboard**: Make DOM focus follow selection with roving tabindex
  (#33): keyboard navigation previously moved the highlight but left DOM
  focus on the originally clicked row, showing a stray native
  :focus-visible outline. Only the selected row is a tab stop;
  KeyboardShortcuts moves DOM focus after every selection change;
  sidebar project rows keep plain tab order; creating a task/heading
  moves focus to the new row.
- **ui**: Notes editor shows a text cursor and accepts clicks across its
  full height (#32) — the min-height now sits on the editable
  `.ProseMirror` element, so the blank area below the first line is
  clickable (frontend and desktop stylesheets).

## [0.3.2] - 2026-09-18

### Features

- **keyboard**: Things3-aligned keyboard shortcuts P0 (#28): a global
  keymap registry (ADR-0004) with a single window-level keydown listener,
  a cross-page selection model covering the 8 bucket pages plus
  project/area/tag detail pages, Cmd/Ctrl/Alt+1..6 bucket jumps, arrow-key
  navigation, Cmd/Ctrl+A select-all with batch complete/delete,
  Cmd/Ctrl+K complete, Backspace/Delete trash (restore in Trash),
  Space/Enter/Esc inline expand-edit, Space new task below selection,
  Cmd/Ctrl+F search and new-task/new-project/new-heading shortcuts.
  Quick Add is now Cmd/Ctrl+Shift+Space to avoid IME and Spotlight
  conflicts.

### Fixes

- **auth**: Harden the token lifecycle (#31): revoke all refresh tokens on
  password change (re-issuing one fresh token for the current session),
  revoke the refresh token on logout even when the access token has
  expired, and serialize web refresh across tabs with Web Locks so two
  tabs hitting 401 simultaneously no longer trip refresh-token reuse
  detection and log every tab out.
- **auth**: Show error feedback on web login/register failures (401/409/400
  inline messages, client-side 8-char minimum) and a success notice after
  redirecting to login post-register (#31).
- **auth,keyboard**: Wire the web auth-flow navigation adapters in
  main.tsx so afterLogin/afterRegister/onLoggedOut redirects actually
  happen; logout now navigates to /login (#30).
- **keyboard**: Enter expand now toggles (matching the click cycle), the
  native-button escape-hatch no longer swallows Enter/Space on
  role="button" rows, and the task created below a selection is selected
  so delete/complete act on it (#30).
- **ui**: Stop the "Note…" placeholder from overlaying existing notes —
  with `immediatelyRender: false` the editor-state selector kept reporting
  `isEmpty` before the first transaction; affects task and project notes
  (#29).

## [0.3.1] - 2026-09-17

### Changed

- **release**: 统一桌面端与 Web/后端的版本号（desktop 0.2.0 → 0.3.1 对齐），
  双轨制改为单轨：`pnpm release <x.y.z>` 一次 bump 全部包与 Tauri 三件套，
  `v*` tag 同时触发镜像发布（`release.yml`）与三平台桌面打包
  （`desktop-release.yml`），不再使用 `desktop-v*` tag。历史双轨小节保留。

## [0.3.0] - 2026-09-16

### Features

- **agent**: Conversational Assistant V1 (#22). A backend `agent` module runs
  @earendil-works/pi-agent-core with @earendil-works/pi-ai: per-conversation
  agent pool rebuilt from persisted messages, BYOK provider config
  (AES-256-GCM encrypted, connectivity test endpoint), tools wrapping
  existing services scoped by user, and a beforeToolCall approval flow with
  10-minute expiry. Conversations and messages persist across restarts; an
  SSE endpoint streams message updates, tool executions and approvals.
- **ui**: `/agent` chat view shared by web and desktop — conversation list,
  streaming message bubbles, tool and approval cards — plus an Assistant
  settings tab with provider presets ([OI]/DeepSeek/OpenRouter/Ollama/custom).
  Requires the `AGENT_ENCRYPTION_KEY` env var on the backend.

### Fixes

- **frontend**: Restore the user after a full page reload (#21). Startup now
  fetches `/auth/me` when only the token survived the reload, and
  ProtectedRoute waits during recovery instead of flashing an unauthenticated
  UI.

### Refactors

- **ui**: Group logbook and trash between the main navigation and areas in
  the sidebar (#20).

---

## Desktop [0.2.0] - 2026-09-16

### Features

- **agent**: Conversational Assistant in the desktop client (#22): the shared
  `/agent` chat view (streaming bubbles, tool and approval cards) and the
  Assistant settings tab with BYOK provider presets. Requires backend v0.3.0
  or newer and a configured `AGENT_ENCRYPTION_KEY`.

### Fixes

- **frontend**: Restore the user after a full page reload (#21).

### Refactors

- **ui**: Group logbook and trash between the main navigation and areas in
  the sidebar (#20).

---

## Desktop [0.1.2] - 2026-09-15

### Fixes

- **desktop**: Require a 2xx response from the backend health probe before
  saving the server URL in server setup. A typo pointing at an unrelated
  host (or a path that 404s) was previously accepted silently and only
  surfaced later as failing API calls; the form now reports an unreachable
  server up front. Depends on the unauthenticated `/api/v1/health` endpoint
  shipped with the v0.2.1 backend.
- **ui**: Stop nesting buttons inside the project row button (React
  `validateDOMNesting` warning); row navigation now uses a `role="button"`
  div with Enter/Space activation, and Space on the progress ring toggles
  completion without navigating.

---

## [0.2.2] - 2026-09-15

### Fixes

- **frontend**: Restore the web UI styling. The Tailwind `content` globs
  still pointed at `./src` after 0.2.1 moved every component and page into
  `@taskora/ui`, so the built stylesheet shipped almost no utility classes
  and the deployed app rendered as unstyled text. `../ui/src/**/*.{ts,tsx}`
  is now scanned, as it already was for the desktop client.

---

## [0.2.1] - 2026-09-15

### Features

- **monorepo**: Extract the `@taskora/api` and `@taskora/ui` packages so the
  web and desktop clients share one data layer and component set (#16).
- **settings**: Show the real per-client version in Settings → About instead
  of a hardcoded value (#17).

### Fixes

- **backend**: Support the desktop refresh flow — `POST /auth/login`,
  `/auth/refresh` and `/auth/logout` now accept and return the rotating
  refresh token in the request body when the client sends `X-Client: desktop`.
  Non-cookie clients (the Tauri webview) could never hold the `SameSite` `rt`
  cookie, so every restart ended in a forced re-login (#18). Requires desktop
  client 0.1.1 or newer.
- **backend**: Add an unauthenticated `/api/v1/health` liveness probe for
  clients and container healthchecks.
- **ui**: Stop nesting buttons inside the project row button.
- **frontend**: Make the sidebar hover highlight instant on enter (#15).

---

## Desktop [0.1.1] - 2026-09-15

### Fixes

- **desktop (0.1.1 re-release)**: Store Windows sessions in a per-user
  DPAPI-encrypted local file, migrate legacy credentials, and wait for
  the complete token pair to be saved before completing login.
- **desktop**: Restore sessions once at startup, coordinate token rotation
  across windows, and retain credentials on network/timeout/server errors.
  Session recovery errors now offer retry or explicit local-session reset.
- **desktop**: Keep sessions signed in across restarts via a body-based
  refresh-token flow stored in the OS keychain (#18). Requires backend
  and desktop to be deployed together.
- **ui**: Show the per-client version in Settings → About instead of a
  hardcoded value (#17).

---

## [0.2.0] - 2026-09-05

### Features

- **calendar**: Add calendar view with month/week grids keyed by dueDate (#11).
- **calendar**: Optimize calendar to a full-width month view (#12).
- **frontend**: Mobile responsive layout with bottom tab bar (#14).

### Fixes

- **frontend**: Unify preference storage with normalization and rollback (#13).
- **frontend**: Remove residual focus ring on task title edit input.

---

## [0.1.6] - 2026-08-28

### Features

- **frontend**: Refresh UI with the Soft Studio visual system (#10).
- **upcoming**: Refine layout with month labels and empty-day spacing (#9).
- **frontend**: Replace favicon with the project icon.

---

## [0.1.5] - 2026-08-10

### Features

- **notes**: Add a markdown WYSIWYG editor (Tiptap) for task and project notes.
- **project-headings**: Add archive/unarchive with cascade-complete.
- **project-headings**: Improve cross-group task drag feedback with a drag preview.
- **project-headings**: Preserve layout and restore in-place edit in the completed panel.
- **sidebar**: Improve project drag feedback.

### Fixes

- **project-headings**: Remove misleading empty-state text under archived headings.
- **project-headings**: Align outside drops with the drag preview.
- **project-headings**: Allow trashed project headings to load.
- **project**: Allow trashed project detail page to open and edit.
- **project**: Tighten ProjectItem vertical padding from py-2.5 to py-1.5.

---

## [0.1.4] - 2026-08-08

### Features

- **settings**: Refactor settings center from a full-page route into a popup
  modal — settings no longer navigates away from the current view.
- **settings**: Overhaul settings center with preference persistence (theme,
  language, week-starts-on synced to backend).
- **frontend**: Unify menu visuals with icons, grouping, and destructive hover
  styles across task, project, and area context menus.
- **frontend**: Collapsible completed-tasks panel on project detail page.
- **frontend**: Project progress ring checkbox replacing the folder icon,
  showing task completion ratio with click-to-complete.
- **frontend**: Calendar date picker for the scheduled-date field (react-day-picker
  based, with today / someday / clear actions).
- **frontend**: Unify subtask row styling with the rest of the app.
- **frontend**: Hide subtask section when a task has no subtasks; hide the
  add-subtask button when subtasks already exist.

### Fixes

- **settings**: Stabilize modal height with a fixed-height scrollable content
  area so switching tabs no longer causes the modal to resize.
- **settings**: Widen settings modal from `max-w-2xl` to `max-w-3xl`.
- **frontend**: Remove hover ring on project progress ring to avoid a double
  circle.
- **frontend**: Progress ring updates, detail page, and full-ring state.
- **frontend**: Close scheduled-date popover after selecting a date.

### Refactors

- **frontend**: Remove skeleton loading design in favor of simpler loading
  states.

### Documentation

- Update frontend specs to reflect the settings modal, completed-tasks panel,
  project UI prefs store, and removed skeleton loading.

---

## [0.1.3] - 2026-08-07

### Features

- **frontend**: Context menu for tasks (TaskContextMenu) with right-click
  actions: complete, date, due, tags, delete/restore.
- **frontend**: Context menu for projects (ProjectContextMenu) mirroring task
  context menu.
- **frontend**: Convert heading to project via context menu.
- **frontend**: Tags field multi-select popover in task/project/area menus.
- **frontend**: Shared MenuRow component for popover-based menus.

## [0.1.2] - 2026-08-06

### Features

- **frontend**: Area detail page with inline title editing and area more menu.
- **frontend**: Sidebar drag-and-drop for projects and areas (dnd-kit).
- **frontend**: Tag detail page.

## [0.1.1] - 2026-08-05

### Features

- **frontend**: Inline title editing for project and area detail pages
  (InlineTitleEdit).
- **frontend**: Project task layout with headings (grouping, drag, convert).

## [0.1.0] - 2026-07-25

### Features

- Initial GTD app: tasks, projects, areas, tags, inbox/today/upcoming/anytime/
  someday/logbook views.
- Auth (register/login/session recovery), preferences, dark mode, i18n (zh/en).
