# Taskora

Things 风格的任务管理器（Web + 桌面端），围绕 Areas / Projects / Tasks 的层级与 Buckets 视图组织个人工作。

## Language

### 任务组织

**Area（区域）**:
用户生活/工作中的顶级组织单位，Projects 与 Tasks 可归属其下。删除 Area 时 Area 本身物理删除（不进 Trash），其下的 Projects（连同其中的 Tasks）与直接归属的 Tasks 一并进 Trash；放回后不再归属任何 Area。
_Avoid_: 领域、分类、category

**Project**:
属于某个 Area（或无归属）的任务容器，内部可用 Headings 分组。
_Avoid_: 清单、list

**Task**:
一条可完成的待办事项，可含 Subtasks、Tags，可设日期并落入 Bucket。
_Avoid_: Todo、item

**Subtask**:
Task 内的子步骤，仅存在于父 Task 内。
_Avoid_: Checklist item

**Attachment（附件）**:
Task 上附带的一个文件，仅存在于父 Task 内（同 Subtask）：随父 Task 进出 Trash、随清空 Trash 一并物理删除，自身没有 Trash；单独移除即物理删除（Delete Request）。是同步实体，只携带元数据（文件名、类型、大小、内容 hash、位次），文件内容在 Blob 里。不可改写内容：替换即移除旧的再添加新的。Repeat Instance / Repeat Project Instance 派生时随 Task 一起复制（指向同一 Blob）。只属于 Task，Project / Area 不设附件；不内嵌于 notes。
_Avoid_: 文件、file、媒体、图片（图片只是一种附件）

**Later Project（稍后项目）**:
处于休眠的 Project：未了结、未进废纸篓，且计划为 Someday，或计划日期晚于账号时区的今天（日期为今天或已过即恢复活跃）。按状态细分为「计划」（未来日期）与「某天」（Someday）。侧边栏不显示稍后项目：无区域的汇总为无区域项目列表末尾一个不可排序的「N 个稍后项目」入口（N ≥ 1 才出现），进入 Later Projects 页；有区域的只在区域页的「计划」/「某天」小节下出现。其内任务不出现在 Anytime / Someday 等汇总视图。纯推导状态，不改写 Project 或 Task 字段。
_Avoid_: 休眠项目（口语可用）、inactive project、归档

**Project Heading（项目分组标题）**:
Project 内的静态分组标题，用于组织 Project 内的 Tasks。未归档的 Heading 可在 Quick Find 中按名称搜到（所属项目须是导航目标），打开即跳到所在项目，该行成为 Selection 并滚入视野。
_Avoid_: 项目标题（易与项目名称混淆）、Section、Group Header

**Tag**:
可带颜色与排序、可附加在 Task/Project/Area 上的标签。Tag 可以嵌套（`parentId`，层数不限），父 Tag 本身也是普通 Tag，可以打标。按 Tag 过滤时命中它的整棵子树（不展开祖先）。删除父 Tag 时子 Tag 提升为顶层（ADR 0016）。
_Avoid_: Tag Group、标签分组（已退役，旧数据迁移为同 id 的父 Tag）

**Effective Tags（有效 Tag）**:
过滤与查询时使用的 Tag 集合：Task 的有效 Tag = 自身 ∪ 所属 Project ∪ 所属 Area（直接归属或经 Project）；Project 的有效 Tag = 自身 ∪ 所属 Area。只用于过滤（tagId 查询、列表过滤栏、Tag 详情页），且按子树命中：有效 Tag 中有该 Tag 或其任一后代即命中（ADR 0016）；行上显示仍只用自身 Tag；继承来的 Tag 不能在 Task 上单独去掉。纯推导，不存储、不同步（ADR 0015）。
_Avoid_: 继承标签写入、复制标签

**Account Time Zone（账号时区）**:
用户在各设备上统一使用的时区，决定「今天」、了结日期归属和 Reminder 的触发时刻；切换时区不改变已设定的计划日期与截止日期。
_Avoid_: 设备时区、服务器时区（两者都不是账号的日历口径）

**Scheduled Date（计划日期）**:
Task/Project 上计划哪天开始做的日历日期（不代表某个时刻）（对应 Things 3 的 When），永不逾期。日期已过的任务按「今天」对待：留在 Today 视图，计划卡片中选中今天，数据层日期保持原值不改写；在非语境视图（Anytime/项目内等）行上以黄色星星标记「今天」语义，在未来日期才显示灰色短日期 chip；Calendar 视图仍按原日期归格，不归入今天的格子。红色警示色只属于 Deadline，计划日期不套红。
_Avoid_: start date（口语可用，代码用 scheduledDate）、When（Things 原词，仅研究文档引用）

**Deadline（截止日期）**:
Task/Project 上必须完成的日期，可逾期（Overdue）；与计划日期（Scheduled Date，计划哪天开始做、永不逾期）对立。行上以旗帜图标 + 倒计时文案（还剩 x 天 / 今天 / 逾期 x 天）展示，到期/逾期为红色。截止日期 ≤ 今天的未了结条目出现在 Today（对齐 Things 3），与计划类型、Bucket 无关，同时留在原视图；改计划不会让它离开 Today，只有改掉或清除截止日期、或了结 / 删除才离开。Today 中计划日期在以后的这类条目仍显示灰色日期 chip。不设独立提醒（提醒仅依附计划日期）。
_Avoid_: due date（一词两义）、通知日期、DDL

**Reminder**:
Task 上的一个时刻（HH:mm），依附于计划日期（Scheduled Date），到账号时区对应时刻由各客户端触发系统通知；仅 ScheduledType 为 DATE 的 Task 可设。Project 不设 Reminder。按存储的计划日期一次性触发，错过不补发、不随 Today 顺延；在计划日期已过的 Task 上开启或修改 Reminder 时，计划日期一并改写为今天（参考 Things 3：提醒经 When 设置）。
_Avoid_: 闹钟、alarm、通知时间（Reminder 是数据，通知是其触发效果）

**Snooze（稍后提醒）**:
在 Reminder 通知上把提醒顺延到目标时刻（15 分钟后 / 1 小时后 / 明天同一时刻）的动作；实现为对 Task 的普通字段改写——计划日期改为目标时刻在账号时区的日历日、Reminder 改为其 HH:mm，原提醒时刻被覆盖，经字段级 LWW 同步到各设备。不新增字段或实体。若任务在别处已被改期、改提醒、了结或删除（当前提醒时刻与通知不一致），迟到的 Snooze 被丢弃。
_Avoid_: 延后、推迟提醒（口语可用）、本机临时推迟（Snooze 不是设备本地状态）

**Repeat Rule（重复规则）**:
Task 或 Project 上的一个结构化规则字段（单位 × 间隔 × 周模式的星期几集合），声明该 Task / Project 完成后按规则再现；锚点默认从计划日期推算，可选从完成日期推算。仅 ScheduledType 为 DATE 的 Task / Project 可设；移入 Someday/NONE 时自动清除。
_Avoid_: 循环、周期任务、RRULE、模板（无独立模板实体）

**Repeat Instance（重复实例）**:
带 Repeat Rule 的 Task 完成时由客户端按规则派生出的下一个 Task，携带相同规则使链得以延续。是普通 Task 而非特殊实体；未来日期落 Upcoming，计划日期已到或已过落 Today。来源有截止日期时，实例的截止日期按计划日期的位移平移（保持提前量，与 Skip Occurrence 同口径），来源没有则实例也没有。派生后即独立：重开（撤销完成 / 撤销取消）来源任务不删除它；实例以 repeatSourceId 记录来源，来源已有未进 Trash 的实例时再次完成不重复派生。
_Avoid_: 副本、克隆（实例是正式任务，不是复制品）

**Repeat Project Instance（重复项目实例）**:
带 Repeat Rule 的 Project 完成时派生出的下一轮 Project：项目连同其 Project Headings、Tasks、Subtasks 整份复制，全部重置为未完成——未进 Trash 的任务不论这一轮完成、取消与否都复制（对齐 Things 3：重复项目是每轮重来的清单），项目内重复链的后代除外（只复制链的源头）；任务自身的计划日期与截止日期按项目计划日期的位移平移。普通 Project，`repeatSourceId` 记录来源；派生后即独立，重开来源项目不删除它。完成仍有未了结任务的项目时先询问剩余任务标记为完成还是取消（一并了结时不派生这些任务自己的 Repeat Instance）。Skip Occurrence 同样适用于重复项目：项目与其内未了结任务的日期一起推进。
_Avoid_: 项目模板、项目副本（实例是正式项目）

**Duplicate（复制）**:
把一个 Task 或 Project 整份复制成独立的新条目（对齐 Things 3 的 ⌘D）。内容照抄（标题、备注、计划日期、截止日期、提醒、重复规则、归属、Tags；Project 连同其 Project Headings、未进 Trash 的 Tasks、Subtasks），状态一律重置为未完成（同 Repeat Project Instance 的口径，副本常被当模板用）；附件随 Task 复制，指向同一 Blob。副本不记来源（`repeatSourceId` 为 null），紧跟来源排列：Task 在列表中、Project 在侧边栏中。日期不平移。
_Avoid_: 克隆、副本任务（口语可用）、copy（易与复制为文本混淆）

**Repeat Chain（重复链）**:
同一规则沿 Task 字段传递形成的实例序列；无中心模板，编辑某实例的规则只影响该实例及其后代，链自然分叉。链在取消、移出日期或到达 until 日期时终结。
_Avoid_: 系列、模板实例（链是结果不是投影）

**Skip Occurrence（跳过本次）**:
把一个重复任务的计划日期原地推进到链的下一个出现日的动作：锚点为计划日期时取第一个晚于原计划日且不早于今天的出现日（错过多轮计划日期则跳过全部错过的），锚点为完成日期时以今天为锚推进一次；已有截止日期同步平移，Subtask 全部置回未完成。不新建实例、不进 Logbook、链不分叉。链已到头（until）或该任务已有派生实例时不可用。
_Avoid_: 推迟、延期（那是普通改期）

**Repeat Preview（下次预告）**:
Upcoming / Calendar 中对一条 Repeat Chain 下一次出现的只读投影：每条链只投影一次，灰色弱化、无复选框、不进 Selection。不是 Task、不存储、不同步，纯渲染层推导。锚点为完成日期的规则不投影（下一次取决于实际完成日）；下一次不晚于今天、链已终结或下一次已派生时不投影。
_Avoid_: 幽灵任务、虚拟实例（预告不是实例）

**Calendar Subscription（日历订阅）**:
用户粘贴的一个外部日历 ICS 链接（Google / Outlook / iCloud 等的 iCal 地址），带名称、颜色与启用开关（ADR 0023）。存在 Sync Hub、经 REST 管理，不是同步实体，不进 Local Replica；由 hub 拉取并缓存解析结果。添加时先拉取一次，链接无效即拒绝。
_Avoid_: 日历账号、日历集成（泛称可用）、calendar sync（并不双向同步）

**Calendar Event（日程）**:
Calendar Subscription 中的一次出现，只读显示在 Today（任务之前）、Upcoming（按天分组与月份分组，均在任务之前；月份分组行上带日期）与 Calendar（格内先于任务的色块、当天面板顶部）。不是 Task：没有复选框、不能拖动或编辑、不进 Selection，按 Tag 过滤时隐藏；不存储、不同步，离线时不显示。定时日程按账号时区归到它覆盖的每一天，全天日程按日期。
_Avoid_: 事件（与 Change Event 混淆）、会议、日历任务

**Bucket**:
按状态/时间过滤出的任务视图：Inbox、Anytime、Scheduled、Someday、Today、Upcoming、Logbook、Trash。不是存储位置。
_Avoid_: 收纳桶、列表、filter、缓存

**Upcoming（计划）**:
按未来计划日期组织 Task / Project 的任务视图，与表示已安排计划的 Scheduled 不同。
_Avoid_: 即将

**Scheduled（已计划）**:
Task / Project 设置了具体日期或 Someday 的 Bucket；Upcoming（计划）是按未来日期展示的视图，两者不是同义词。

**Anytime（随时）**:
可随时着手的任务视图。
_Avoid_: 任意时间

**Someday（某天）**:
暂不指定具体计划日期的计划类型及其任务视图；Later Project（稍后项目）还包含未来日期项目。
_Avoid_: 稍后（不可用来指 Someday）

**Deadlines（截止日期列表）**:
所有带截止日期的未了结、未进 Trash 的 Task 与 Project（含 Later Project 及其内任务）的隐藏列表（对齐 Things 3）：不在侧边栏、没有计数，只能从 Quick Find 进入。按截止日期升序（逾期的在最前），同一天内按 Position / Feed Position；平铺不分组，不可拖拽排序。
_Avoid_: 到期列表、DDL 列表

**Hidden List（隐藏列表）**:
不在侧边栏、没有计数、只能从 Quick Find 的「列表」组进入的列表（对齐 Things 3）：Tomorrow、Deadlines、Repeating、All Projects、Logged Projects。不能固定到侧边栏，也不在手机首页。
_Avoid_: 智能列表、smart list、隐藏视图

**Tomorrow（明天）**:
Upcoming 中计划日期为账号时区明天的 Task 与 Project（与 Upcoming「明天」一节同一批条目）的隐藏列表；截止日期在明天不算。展示同 Today：按偏好分组或平铺、可拖拽排序，不显示 Repeat Preview。
_Avoid_: 明日待办

**Repeating（重复列表）**:
所有带 Repeat Rule、未了结、未进 Trash 的 Task 与 Project（含 Later Project 及其内任务）的隐藏列表，即每条 Repeat Chain 当前的一环；尚未移入 Logbook 的已了结条目不算（链已经走到它派生的实例）。按计划日期（下一次出现）升序，同一天按 Position / Feed Position；平铺不分组，不可拖拽排序。
_Avoid_: 重复模板列表（没有独立模板实体）

**All Projects（所有项目）**:
所有未了结、未进 Trash 的 Project（含 Later Project）的隐藏列表：无区域的在最前，之后每个有项目的 Area 一节；节与节内顺序都跟随侧边栏。不可拖拽排序。
_Avoid_: 项目总览

**Logged Projects（已完成项目）**:
Logbook 中的 Project 的隐藏列表，按了结时间分组（规则同 Logbook）；不含 Archived Logbook。
_Avoid_: 归档项目（「归档」专指 Archived Logbook）

**Inbox**:
「尚未整理」的 Bucket：无归属（Project / Area）、无计划（计划类型为 NONE）的未了结任务。任何整理动作都会让任务离开 Inbox：获得归属转入 Anytime，获得计划转入 Scheduled。移入 Inbox 时同时清除归属与计划（计划日期、提醒、重复规则随之清除），截止日期保留（参考 Things 3）。不是 Project，也不是存储位置。
_Avoid_: 收件箱项目、默认项目

**New in Today（新到）**:
Today 中上次确认之后**随日期到来**才进入的 Task / 独立项目行（参考 Things 3 的黄色 new in Today 圆点）：计划日期或截止日期任一已到（≤ 今天）且晚于「最近一次确认的日期」（账号偏好 `todayReviewedOn`），且该日期字段在这天之前就写好了（字段的写入时刻，取其 HLC 墙钟，按账号时区早于该日）。当天才手动排到今天、设成今天或设成已过日期的不算；写入时刻未知的旧数据只按前一条判断。新到条目留在原有排序位置与分组里，行首左侧带黄点（被组头吸收的项目，黄点在组头上）；Today 标题下有黄色横幅「你有 X 个新的待办事项」，X 为未读新到数，最右「好」一次确认全部（已确认日期推进到今天）。单条已读：展开 / 打开（任务展开、进入项目页）、编辑任何字段、拖拽排序某条新到即清掉该条黄点（账号偏好 `todaySeenKeys`，按「条目 + 让它进入 Today 的日期」记，两条路径都成立时取计划日期；改期或改截止日期后再次到来重新算新到）；选中、悬停不算；逐条读完等同确认。进出 Today 不清除；侧边栏 / 手机首页的 Today 入口在仍有未读新到时带黄点。已确认日期只进不退，单条已读跨端取并集，均经账号偏好同步。从未确认过时以首次进入 Today 的日期为起点，不标新到。纯推导，不改写 Task / Project 字段。
_Avoid_: 通知、新任务（不是新建的任务，而是新进入 Today 的任务）

**Review（回顾）**:
定期逐个检查 Project 与 Area 是否仍然有效、是否缺下一步的动作（参考 OmniFocus Review）。参与回顾的是所有 Area，以及未了结、未进 Trash 的 Project（含 Later Project）；Task 不参与。每个对象都必须参与，不可关闭（不想常看就把间隔设长）。
_Avoid_: 复盘、周回顾（回顾按对象各自的间隔排期，不是全局周期）、todayReviewedOn（那是 New in Today 的「已确认」日期，与回顾无关）

**Review Interval（回顾间隔）**:
Project / Area 上的「N × 单位（天/周/月/年）」字段：标记已回顾时下次回顾日为今天加间隔。新建时写入该对象类型的 Default Review Interval，之后属于对象自己。修改间隔时，下次回顾日若仍是排期算出的值（上次回顾日，从未回顾则创建日，加原间隔），就按新间隔从同一起点重算（结果可能已到期）；被手动改过（直接编辑、延后、新建时指定）则不动。Repeat Project Instance 派生时沿用来源的间隔。为空只出现在存量或不合法数据上，按默认值计算，标记已回顾时补写。
_Avoid_: 回顾周期、review frequency、跟随默认（间隔总是对象自己的值，没有继承）

**Default Review Interval（默认回顾间隔）**:
账号偏好里按对象类型分的两档回顾间隔：项目（初始每周，含 Later Project）、Area（初始每月）。只决定新建对象时写入的间隔；修改它不影响已有对象。
_Avoid_: 全局回顾周期

**Next Review Date（下次回顾日）**:
Project / Area 上下次该回顾的日历日；不晚于账号时区的今天即为「待回顾」。用户可直接编辑（含明天 / 1 周后 / 1 个月后快捷项）。新建（含 Repeat Project Instance 派生）时为当日 + 回顾间隔。「手动改过」不单独存储，由它是否等于排期算出的值推导（见 Review Interval）。
_Avoid_: 回顾截止日、review due（不逾期、无红色警示）

**Last Reviewed Date（上次回顾日）**:
Project / Area 上最近一次标记已回顾的日历日，只由标记已回顾写入，用户不可直接编辑；为空即「从未回顾」。用于显示，并作为修改间隔时重算下次回顾日的起点。新建与 Repeat Project Instance 派生时为空。
_Avoid_: 上次查看、最后修改时间

**Mark Reviewed（标记已回顾）**:
完成对一个 Project / Area 的回顾：上次回顾日记为账号时区的今天，下次回顾日为今天加回顾间隔，与原下次回顾日无关（同 OmniFocus；11.1 每月、12.3 才回顾 → 1.3）。只在 Review 里提供（回顾模式的回顾栏与回顾列表），「…」菜单的回顾设置里没有。
_Avoid_: 完成回顾（「完成」专指 Task / Project 的了结）

**Postpone Review（延后）**:
回顾模式中把当前对象的下次回顾日改到之后某天（明天 / 1 周后 / 1 个月后 / 选日期）并进入下一个；不算已回顾，上次回顾日不变。
_Avoid_: 下一个（只前进、不改任何数据，对象仍待回顾）、推迟回顾

**Review Mode（回顾模式）**:
从侧边栏 Review 入口（与 Logbook、Trash 同组，带待回顾数）进入的逐个回顾流程：进入时把待回顾的 Project / Area 按下次回顾日、同日按侧边栏顺序排成一份队列快照，一次展示一个对象的完整可编辑页面，配回顾栏（进度、回顾设置、标记已回顾、延后、下一个、上一个、退出；回顾设置与「…」菜单是同一个选择器）。标记已回顾、延后或了结 / 删除当前对象（即「处理」）后自动去本轮下一个未处理的对象（先往后找，后面都处理过就从头找），本轮全部处理完才结束并回到列表；上一个 / 下一个只在快照里前后移动（不标记、不改日期，对象仍待回顾），到头 / 到尾时禁用，不结束本轮。快照只活在本次访问中，重新进入即按当时的待回顾集合重建；不持久化、不同步。队列空时为空状态，显示下一次回顾日。
_Avoid_: Review 视图 / Bucket（它不是按状态过滤的视图，而是一个流程）、Review 透视（OmniFocus 词）

**Grouped View（分组视图）**:
Bucket 视图的一种展示形态：视图内任务按其直接父级（Project，无项目时按 Area）聚类显示，区别于任务平铺的 Flat View。组是纯渲染层推导，不改数据模型。
_Avoid_: 分节、分类显示

**Group Header（分组头）**:
Grouped View 中位于每组任务上方、代表其父级 Project / Area 的标题行；有 ≥1 个可见任务才出现（空父级不出现），下横线小节标题形态、不可折叠，组间顺序跟随侧边栏中 Project / Area 的全局视觉顺序（扁平单层：区域内项目的任务直接归入项目组，不再嵌套于 Area 组）。项目自身日期匹配视图但无视图内任务时，仍以独立项目行出现（此时无组头）。与 Project Heading（项目内部的静态分组标题）是不同概念。
_Avoid_: Section、Project Heading

**Logbook Entry**:
已了结（完成或取消）任务的档案记录，按了结日期（今天/昨天/更早）分组展示。Logbook 即所有 Logbook Entry 的聚合视图。何时从原视图移入由 Logging Mode 决定，尚未移入的是 Unlogged Item，不在 Logbook 里。
_Avoid_: 已完成列表（Logbook 不只含完成任务）

**Cancelled**:
任务被主动放弃的终态：留痕、可逆，记录于 Logbook。与 Completed（做完的了结）、Trashed（软删除暂存）三者互斥。取消已完成的任务会直接改写终态（不必先重开）。取消父 Task 不改动其 Subtasks。
_Avoid_: 取消 = 删除、abandoned、丢弃

**Settled / Settled At（已了结 / 了结时间）**:
任务进入终态（Completed 或 Cancelled）这一事实的统称；了结时间记录何时发生，不区分是哪种了结（由 status 表达）。Logbook Entry 按了结时间分组。
_Avoid_: 已完成泛指完成与取消的集合、完成时间（取消任务并未"完成"）

**Task Terminal State**:
任务的两种了结状态：Completed（做完）与 Cancelled（放弃）。皆留痕、可逆，记录于 Logbook；与 Trash（软删除）正交。取消父 Task 不改动其 Subtasks。
_Avoid_: 把 Cancelled 当作 COMPLETED 的子集、把终态与删除混淆

**Logging Mode（移入时机）**:
账号偏好 `loggingMode`，决定已了结的 Task / Project 何时离开原视图、成为 Logbook Entry（对齐 Things 3）：立即（缺省）、每天（了结日按账号时区早于今天即移入）、手动（执行 Log Completed 才移入）。经账号偏好同步（LWW）。从立即切到每天 / 手动、或在两者之间切换时，水位线 `loggedThrough` 设为当前时刻（切换之前了结的不回到原视图）；切回立即不写水位线，剩余的 Unlogged Item 全部按已移入对待。
_Avoid_: 归档时机（「归档」专指 Archived Logbook）

**Unlogged Item（未移入条目）**:
已了结但尚未移入 Logbook 的 Task / Project，纯推导：立即模式下不存在；否则了结时间晚于水位线 `loggedThrough`（每天模式下还须了结日为今天）、且不早于 Archived Logbook 的保留期截止时刻。任务一律按自己的了结时间判断（项目了结时其内任务同时了结，结果与项目一致；早已了结的旧任务不会因项目刚完成而回到原视图）。留在原视图原位（Inbox / Today / Upcoming / Anytime / Someday、项目页、Area 页、Tag 页、侧边栏中的已完成项目），删除线 + 弱化，Quick Find 按普通条目搜到；不出现在 Logbook（含项目页的「已了结」面板），不在 Deadlines，不计入侧边栏 / 首页角标与状态栏常驻通知，不算 Today 的新到（项目进度照常计为已完成）。点勾选框即重开（已取消的撤销取消）；重复任务完成后它与派生的 Repeat Instance 同时可见。Calendar 不受影响。
_Avoid_: 待归档、已完成未归档

**Log Completed（移入已了结）**:
把账号所有 Unlogged Item 一次移入 Logbook 的命令：把 `loggedThrough` 推进到当前时刻。入口：`⇧⌘Y`（可改绑）、任务 / 项目右键菜单、Logbook 页顶部按钮（手机端的入口）；立即模式下全部隐藏。执行后 toast 可撤销，撤销把水位线退回执行前的值（水位线唯一的回退）。
_Avoid_: 归档已完成、清理已完成

**Trash（废纸篓）**:
软删除的暂存处，可放回；倾倒后不可恢复。放回只撤销删除：回到删除前的位置与状态（已了结的回到 Logbook），进 Trash 时清掉的提醒不恢复。在 Trash 中改计划 / 截止日期、归属、标签、重复规则即隐式放回（项目连同随它进 Trash 的任务）；改状态、标题、备注、子任务不放回。
_Avoid_: 回收站

**Put Back（放回）**:
撤销 Task / Project 的软删除，返回删除前的位置与状态；不是重开任务。
_Avoid_: 恢复（用于此动作时）

**Empty Trash（倾倒废纸篓）**:
永久删除废纸篓中所有 Task / Project 的动作，不可恢复。
_Avoid_: 清空废纸篓

**Account（账号）**:
用户登录并在各设备上访问同一份任务数据的身份，账号偏好跨设备统一。
_Avoid_: 账户、帐号

### 界面交互

**Selection**:
仅存在于键盘交互域：键盘导航下当前被高亮、并作为键盘动作（完成、删除、新建于下方等）作用对象的 Task / Project / Project Heading；区别于 focus（DOM 焦点）与完成态。可多选（对齐 Things 3 Mac）：⌘A 全选，⌘/Ctrl+点击切换单行，⇧+点击 / ⇧↑↓ 选中锚点到光标的连续范围；多选只含 Task。拖动多选中的一行即多项拖拽：其余选中行收起（被拖条目始终贴着手），松手后整组按原顺序落在落点，并一起改归属 / Heading / 计划日期；也可整组拖到侧边栏（Sidebar Drop）。右键多选中的一行，菜单作用于整组；右键多选之外的行则改为只选中该行。触控交互没有 Selection：点击 = 打开详情，勾选用专用 checkbox，长按只负责拖动排序，批量或行级操作走 Multi-Select Mode。
_Avoid_: 高亮、hover、焦点

**Multi-Select Mode（多选模式）**:
触控交互中显式进入 / 退出的模式（对齐 Things 3 iPhone）：左滑 Task 行进入并勾选该行，模式中点击行 = 切换勾选，底部工具栏对勾选集合批量执行计划、移动、删除，其余动作（完成、取消、截止日期等）收在「更多」里。动作执行完、点「完成」、切换页面或系统返回即退出。与键盘 Selection 互不相通：进入时清空 Selection、收起展开行。Trash 中同样左滑进入，工具栏「删除」换成「放回」。
_Avoid_: Selection（键盘专属）、编辑模式、批量选择

**Sidebar Drop（拖到侧边栏）**:
桌面 / Web 指针交互中把 Task（含 Selection 多选整组）或 Project 行拖放到侧边栏行上的动作（对齐 Things 3 Mac），是对应既有动作的快捷方式，不引入新语义：Inbox / 区域 / 项目 = 移动，Today = 计划为今天，Upcoming = 条目不动、在该行旁弹出计划日期卡片（同「计划」选择器），Anytime = 清除计划（无归属的任务一并离开 Inbox），Someday = 计划为 Someday，Logbook = 完成，Trash = 删除。Project 不接收 Inbox 与项目落点。Calendar、回顾、稍后项目入口不是落点。已符合目标的条目落下即跳过；落下后停留在当前页、清空 Selection。触控交互没有 Sidebar Drop。
_Avoid_: 拖入、投放、drop target（泛指落点时可用）

### 引擎与同步（local-first）

**Engine（引擎）**:
本地数据副本与同步机制的统称：UI 的所有读写都直接作用于本地副本，由 Engine 负责与服务器收敛。工程上是一个跨端共享包，不绑定具体存储实现。
_Avoid_: 数据库、缓存、ORM、offline cache

**Local Replica（本地副本）**:
每台设备持有的该用户数据镜像，是 UI 读写的直接对象；不可视为可随时丢弃的缓存。除 Archived Logbook 与 Blob（按需下载）外是全量的。
_Avoid_: cache、镜像只读副本

**Blob**:
Attachment 的文件内容，以 sha256 内容寻址、写入后不可变，因此不参与字段级 LWW、永无冲突。不走 Change Event：经独立的上传 / 下载通道在设备与 Sync Hub 之间传输。Local Replica 不预取 Blob，打开或预览附件时才按需下载并缓存在本机；本机缓存可随时丢弃重下。Sync Hub 按用户隔离存储（同用户内同内容只存一份），不再被任何 Attachment 引用的 Blob 由 hub GC 回收。
_Avoid_: 文件内容写进 Change Event、附件本体（Attachment 指元数据实体）

**Archived Logbook（归档 Logbook）**:
Local Replica 不保留的旧 Logbook Entry：了结时间早于保留期（缺省 365 天）、不在 Trash、不属于进行中项目的已了结任务及其 Subtask。它们留在 Sync Hub，Logbook 滚到底时按页读取，只读；在 hub 上被修改后会随变更回到副本。归档不是删除：不产生 Compact Event，也不登记。
_Avoid_: 已删除、冷数据、Trash

### 同步

**Change Event**:
同步协议中的变更单元，携带实体、字段与元信息，双向流动于设备与 sync hub 之间；不再仅指服务端推送。
_Avoid_: 消息、推送、payload

**Sync Hub**:
服务器在 local-first 架构中的角色：接收各设备推送的 Change Event、按字段级 LWW 合并、供设备拉取。不再是唯一的写入入口。
_Avoid_: API 服务器、权威数据库（ authoritative 只指合并后的服务端副本）

**Field-level LWW（字段级 Last-Writer-Wins）**:
冲突解决模型：每个实体的每个字段独立携带修改时间戳，并发冲突时新者胜；同一字段真并发时按设备 ID 决胜，败方编辑被丢弃（接受的语义，不弹冲突 UI）。合并出违反跨字段规则的组合（别的项目的分组、Someday 带提醒等）时，由 Sync Hub 按规则纠正，收紧的一方获胜。
_Avoid_: 整实体覆盖、弹窗合并

**HLC（Hybrid Logical Clock，混合逻辑时钟）**:
字段时间戳的取值机制：墙上时钟 + 逻辑计数，兼顾可读性与因果序；每条变更另携设备 ID 作决胜。
_Avoid_: 服务器时间、纯墙上时钟

**Position**:
实体在列表中的排序位次（Task、Subtask、Project、Project Heading、Area、Tag 都有），用 fractional indexing 字符串表达，是实体的普通字段，纳入字段级 LWW；插队只需在两个邻居间生成新串，无需重排他人。需要后台偶尔 re-balance 防字符串膨胀。列表顺序只看 Position（旧的整数 sortOrder 已随同步协议 4 退役）。
_Avoid_: 整数序号、sortOrder、order index

**Feed Position**:
Project 在 feed 视图（Today / Upcoming / Someday 等）中作为独立项目行、与 Task 混排时的排序位次；与 Task 的 Position 同处一个 fractional indexing 键空间，是 Project 的普通字段，纳入字段级 LWW。只在 feed 中拖动项目行时写入；为空时 feed 按项目的 Position 排。项目的 Position 只表达侧边栏顺序，两者互不影响。Task Position 与 Feed Position 一起 re-balance，保证修复膨胀键不打乱混排顺序。
_Avoid_: 今日排序、todayIndex、视图内序号

**Outbox**:
断网或同步未完成时，本地写操作在设备上的排队区；联网后一次性 flush 到 Sync Hub。
_Avoid_: 消息队列（MQ 意义上的）

**Sync Cursor**:
设备记录的「已拉取到的每用户单调序号」位置，增量拉取以此为起点。序号由 Sync Hub 的持久化变更日志分配（保留 30 天），hub 重启不失效；早于保留窗口或来自旧世代的 cursor 触发全量 bootstrap。
_Avoid_: offset、分页游标

**Compact Event（压缩变更）**:
Hub 的 GC 物理删除实体后下发给设备的变更类型：指令设备从 Local Replica 中移除一批实体，区别于携带实体内容的 Change Event。在倾倒废纸篓 / 级联清理 / Delete Request 后产生；设备写入 hub 上已不存在的实体时，hub 也回以 Compact Event 让它收敛。
_Avoid_: 硬删除广播、tombstone（我们用软删除，无墓碑）

**Delete Request（删除请求）**:
设备发给 Sync Hub 的物理删除请求（ADR-0008）：携带实体类型与一批 id，hub 校验归属后删除并以 Compact Event 广播；设备端在 Outbox 排队、断网可用。与设备端软删除（trashedAt 等普通字段变更）相对。
_Avoid_: 硬删除广播、墓碑（不携带值与时钟）

**Event Stream**:
设备与 Sync Hub 之间的常驻双向通道，按单调递增的序号传输 Change Event；从旧的服务端单向推送通道演化而来，现为同步协议的传输层。
_Avoid_: WebSocket、订阅、频道

### 助手（Agent）

**Assistant**:
用户可见的对话式助手功能名（文案中称「助手 / Assistant」）。工程上由 Agent 模块实现。
_Avoid_: Copilot、聊天机器人

**Conversation（对话）**:
用户与 Assistant 的一段持久化对话，含完整消息历史；用户可创建多个并切换。对话列表中的每一条就是一个 Conversation。
_Avoid_: 会话（认证场景称「登录会话」）、Session（与 pi-agent-core 的 `sessionId`——仅作 provider 缓存用途——冲突）、Chat

**Destructive Operation**:
不可逆或影响全局结构的工具操作（删除、倾倒废纸篓、改动 Area/Project 结构），执行前必须经用户批准卡片放行。
_Avoid_: 危险操作
