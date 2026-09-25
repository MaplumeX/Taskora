# 调研：Things 3（Cultured Code）的 Logbook 界面设计

> 调研时间：2026（当前版本 3.2x）；调研目标：为 Taskora 的 Logbook 界面优化提供参考。
> 来源优先级：Cultured Code 官方支持文档 / 官方博客 / 官方发布说明（一手） > 带截图的权威评测与社区实测（二手，已标注）。

## Summary

Things 3 的 Logbook 是一个**按完成日期分组、最新在前的只读档案**：所有已完成或已取消的待办与项目最终都归入此处，无限期保留。每条记录行以「勾选/X 状态图标 + 标题 + 行内完成日期（位于日期与标题之间）+ 灰色父列表标签」呈现，可点开查看完整详情卡片、可点击勾选框撤销完成（恢复为未完成），取消的条目以 X 图标 + 删除线与完成条目区分。官方对 Logbook 的独立文档极少（被官方自己称为"只需简短一提"的列表），其设计哲学是：视觉语言与 Today/Anytime 等列表完全一致，只把「时间」从"将来何时做"翻转为"何时完成的"，让用户在回顾时获得成就感。

---

## Findings

### 1. 信息架构

1. **Logbook 收录四种条目：完成的待办、取消的待办、完成的项目、取消的项目。**
   **Sources:** [Understanding the Default Lists – Things Support](https://culturedcode.com/things/support/articles/4001304/)（"It serves as an archive: all your completed or cancelled to-dos and projects end up here."）
   **Support:** direct evidence（一手）. **Confidence:** high.

2. **条目无限期保留，不设自动清理；官方定位为"你所取得一切成就的完整参考"。**
   **Sources:** [Understanding the Default Lists – Things Support](https://culturedcode.com/things/support/articles/4001304/)（"Every logged item stays in the Logbook indefinitely, a complete reference for everything you've achieved in the past."）；清空需全选手动删除（Mac 上 ⌘A，删除进 Trash 可恢复；iOS 上删除不可逆）。
   **Support:** direct evidence（一手）. **Confidence:** high.

3. **分组方式：按完成/取消日期（stop date）倒序分组，最新完成的天在最上方。Things 没有"今天/昨天/更早"三段式——而是逐日一个分组，用户可以一直向下滚动浏览历史。**
   **Sources:** [Can you search the logbook for a certain date? – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/z9h2qa/)（"when I open the logbook it has events completed by the previous months. With dates… I can manually scroll down to the date"）；[Things 3 review – The Nerdy Student](https://www.thenerdystudent.com/2017/07/things-3/)（"Tasks are sorted by the last task being at the top"）；things-cli 文档亦确认 `logbook` 视图"logs it under its stop date… the way the app's Logbook shows both"（[things-cli Commands](https://things.rlew.io/commands/)，第三方工具对官方行为的描述）。
   **Support:** direct evidence（二手实测，多源一致）+ interpretation. **Confidence:** high（分组按日倒序）；medium（"逐日分组而非三段式"——官方文档未直接说明分组标题粒度，基于多份带截图评测与用户描述推断）。
   > 备注：Taskora 当前的「今天/昨天/更早」三段式与 Things 不同；Things 更接近"逐日分组无限滚动"。

4. **项目与其内容的关系：单独完成的任务逐条出现在 Logbook；当整个项目被完成/取消并归档后，其内部任务不再单独列出，而是随项目一起呈现（Logbook 里显示项目条目）。**
   **Sources:** [iPad Release Notes 3.13.9 – Things Support](https://culturedcode.com/things/support/articles/2409117/)（修复记录："Fixed a bug where logged to-dos would appear individually in the Logbook even when their parent project was also logged."——即正确行为是父子同归档时子项不单独出现）；[Possible bugs with projects and Logbook – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/92vpka/)（用户截图实测：项目归档后内部已完成任务不再单独出现在 Logbook）。
   **Support:** direct evidence（一手发布说明）. **Confidence:** high.

5. **另有独立的「Logged Projects」隐藏列表**（在 Quick Find 中搜索 "Logged Projects" 唤出），只展示已归档的项目——官方称之为"an overview of your past achievements"。
   **Sources:** [The Quick Find Update – Things Blog](https://culturedcode.com/things/blog/2019/12/the-quick-find-update/)；[Understanding the Default Lists – Things Support](https://culturedcode.com/things/support/articles/4001304/)。
   **Support:** direct evidence（一手）. **Confidence:** high.

6. **进入 Logbook 的时机可配置**：设置项 Settings → General → Logbook，可选立即（Immediately）/ 每天 / 手动（Manually）。手动模式下已勾选任务保留在原列表（划线淡化），用 "Log Completed" 命令（iPad/Mac 快捷键 ⇧⌘Y）批量归档。
   **Sources:** [Is it possible for completed tasks to stay in the list? – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/1npp3oo/)（设置路径）；[Mac Release Notes – Things Support](https://culturedcode.com/things/support/articles/1100684/)（"Logging was set to Manual or Daily"）；[iPad Release Notes 3.14](https://culturedcode.com/things/support/articles/2409117/)（"Changed the Log Completed shortcut from Cmd+L to Shift+Cmd+Y"）；[Things AppleScript Commands – Things Support](https://culturedcode.com/things/support/articles/4562654/)（`log completed now` 命令存在）。
   **Support:** direct evidence（一手发布说明 + 二手设置路径）. **Confidence:** high.

### 2. 条目行上的信息与视觉层级

7. **行内包含：状态图标（勾选框）、标题、完成日期（行内，位于日期与标题之间）、灰色父列表（项目/领域）副标题。**
   **Sources:** [iPad Release Notes 3.17.3 – Things Support](https://culturedcode.com/things/support/articles/2409117/)（"Fixed a bug in the Logbook where extra space could sometimes appear between the completion date and a to-do's title."——证明完成日期与标题同处一行内且相邻）；[iPad Release Notes 3.13.10](https://culturedcode.com/things/support/articles/2409117/)（"items in the Logbook wouldn't display the correct subtitle"——证明行内有副标题，即父列表名）；[iPad Release Notes 3.13.10](https://culturedcode.com/things/support/articles/2409117/)（"checkboxes weren't visible for completed or canceled to-dos"——证明 Logbook 行仍显示勾选框）。
   **Support:** direct evidence（一手发布说明，由 bug 描述反推界面结构）. **Confidence:** high.

8. **完成日期的格式：3.5 版之前远期日期用缩写，3.5（2018-04）起"永远显示精确的完成日期"。**
   **Sources:** [Things 3.5 – Things Blog](https://culturedcode.com/things/blog/2018/04/things-3-5/)（"Up to now, the Logbook showed abbreviated dates for items far in the past. We've changed this so you can always determine the exact date of completion."）。
   **Support:** direct evidence（一手）. **Confidence:** high.
   > 备注：是否显示完成**时间**（时刻）在行上，未找到一手来源；官方 "Get Info" 功能可查看条目的创建/完成精确日期时间（[iPad Release Notes 3.11](https://culturedcode.com/things/support/articles/2409117/)："See the exact date and time when a to-do or project was created or completed. Tap ••• > Share > Get Info."）。

9. **标签（tags）是否显示在 Logbook 行上：未找到一手来源。**（Taskora 行内的标签展示属于可自行决策的空间。）

### 3. 分组标题 / 分隔设计

10. **按日分组、每组有日期标题；搜索（Quick Find Continue Search）覆盖 Logbook 时结果中以 "Logbook" 分组标题区隔。**
    **Sources:** [iPad Release Notes 3.13.14](https://culturedcode.com/things/support/articles/2409117/)（"Added a Logbook heading in search results."）；按日分组见 Finding 3。
    **Support:** direct evidence（一手）. **Confidence:** medium-high.
    > 日期标题的精确文案格式（如 "Today" / "Yesterday" / "Monday, 12 May" 是否带相对词）未找到一手来源；官方 Upcoming 列表第一天会显示 "Tomorrow" 而非星期名（[iPad Release Notes 3.19.6](https://culturedcode.com/things/support/articles/2409117/)），可推断 Things 的日期标签惯例是近处用相对词、远处用完整日期，Logbook 大概率同理（researcher inference，标注为推断）。

11. **分组不可折叠、无密度切换：未找到任何一手来源支持 Logbook 有可折叠分组或密度设置。**Things 的折叠能力只存在于侧边栏 Area（3.5 起）与项目内 logged 区的显隐开关（见 Finding 15）。

### 4. 交互

12. **点击勾选框 = 撤销完成（恢复为未完成）；这是官方认可的核心场景——"误勾了可以回 Logbook 取消勾选"。**取消的条目同理可恢复。
    **Sources:** [Things 3 review – The Nerdy Student](https://www.thenerdystudent.com/2017/07/things-3/)（"if you accidentally ticked a task and you didn't mean to, you can go back in untick it"）；设计分析指出取消勾选被视为"非常规操作"，会有确认提示以防误触（[Design Critique: Things 3 – IXD@Pratt](https://ixd.prattsi.org/2020/02/design-critique-things-3-ios-app/)，二手观点）；快捷键 ⌘K 完成/恢复、⌥⌘K 取消（[Matthew Cassinelli](https://matthewcassinelli.com/how-to-cancel-things-tasks/)，Cultured Code 官方 Twitter 曾回复确认该快捷键）。
    **Support:** direct evidence（二手实测 + 半官方确认）. **Confidence:** high（可撤销完成）；medium（iOS 上有确认弹窗这一点仅单源）。

13. **点击行（标题区域）= 展开详情卡片**：Things 3 的核心范式"task as object"——点击任何列表里的任务（含 Logbook），该任务弹出为卡片、背景列表淡出，可查看/编辑全部信息。
    **Sources:** [MacStories: Things 3 review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)（"Tap on a task, and it will pop out into a card-like form while the rest of the list fades into the background."）；[iPad Release Notes 3.23](https://culturedcode.com/things/support/articles/2409117/)（"Unified the display and editing of to-dos – both in lists and when expanded"）。
    **Support:** direct evidence（二手权威评测描述通用行为；一手发布说明证实展开态存在）. **Confidence:** high.

14. **删除：可从 Logbook 删除条目（Mac 上进 Trash 可恢复；iOS 上永久删除、多步确认）；多选手势/⌘A 可批量操作。**
    **Sources:** [Understanding the Default Lists – Things Support](https://culturedcode.com/things/support/articles/4001304/)；[FAQ – Things Support](https://culturedcode.com/things/support/articles/2967034/)。
    **Support:** direct evidence（一手）. **Confidence:** high.

15. **Logbook 之外的"完成态就近可见"**：项目内部有独立的 logged 区——完成的任务保留在项目底部区域（可用 ⌘⇧E / 显隐开关切换显示），区域内的任务行同样带完成日期（3.5.2 曾调整"项目内较老任务的完成日期外观"）。这意味着用户**不必进 Logbook** 也能在项目上下文里看到已完成工作。
    **Sources:** [The Nerdy Student](https://www.thenerdystudent.com/2017/07/things-3/)（"you'll be able to find the completed tasks in a section at the bottom of the project"）；[iPad Release Notes 3.5.2 / 3.19.6 / 3.15.14](https://culturedcode.com/things/support/articles/2409117/)（completion dates inside projects、toggle visibility of later items、Apple Pencil scribble "when logged items are hidden"）。
    **Support:** direct evidence（一手+二手互证）. **Confidence:** high.

### 5. 视觉设计细节

16. **完成态：勾选框变✓、整行淡化（灰色）；取消态：勾选框变 X、标题加删除线（3.13.5 起 iOS 与 Mac 一致："Canceled to-dos now show strikethrough, as on the Mac"）。**
    **Sources:** [iPad Release Notes 3.13.5 – Things Support](https://culturedcode.com/things/support/articles/2409117/)（一手）；[Matthew Cassinelli](https://matthewcassinelli.com/how-to-cancel-things-tasks/)（"it will be marked with an X instead of a checkmark"）；[Mac Release Notes](https://culturedcode.com/things/support/articles/1100684/)（"projects' headings were not dimmed when completed or canceled"——佐证淡化是完成/取消态的标准处理）。
    **Support:** direct evidence（一手）. **Confidence:** high.
    > 注意：Taskora 目前只有"完成/取消"二元态且用勾选框撤销；Things 的三态（open/completed/canceled）+ X 图标 + 删除线是值得借鉴的区分方式。

17. **整体视觉语言：大面积留白、粗体标题、少量克制的彩色图标点缀；"simple, but beautiful in its simplicity"。完成操作有专门的动画（3.15.19 修复过"完成任务时动画丢失"的 bug）与触感反馈（完成项目时触发 haptics，3.13.6）。**
    **Sources:** [MacStories review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)（二手）；[iPad Release Notes 3.15.19 / 3.13.6 – Things Support](https://culturedcode.com/things/support/articles/2409117/)（一手，证明完成动画与 haptics 的存在）。
    **Support:** direct evidence（动画/haptics 为一手；整体美学描述为二手）. **Confidence:** high.

18. **空状态设计：未找到 Things 3 Logbook 空状态的一手截图/描述。**仅有 2015 年 iPad 2.7 修复记录"Fixed a French typo that appeared when the Logbook was empty"（[iPad Release Notes](https://culturedcode.com/things/support/articles/2409117/)），证明空 Logbook 有一句提示文案而非空白页（**Confidence:** medium，间接证据；具体文案未知）。Things 其他列表的空状态惯例是水印式插图+一句话（如项目水印，3.1.2 提及），可作风格参考（researcher inference）。

### 6. 完成项目的呈现

19. **完成的/取消的项目在 Logbook 中作为独立条目出现，与任务同级；视觉上项目用「进度圆环（progress pie）」替代勾选框**——项目名左侧的圆圈随完成度填充，点击填满的圆环即完成项目并归档。
    **Sources:** [Log Completed Projects? – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/fcgzii/)（"Click the big blue circle (or pie chart) next to the project name"）；[The Nerdy Student](https://www.thenerdystudent.com/2017/07/things-3/)（"a circle is shown, and this fills as you complete tasks in that project"）；[iPad Release Notes 3.20.9](https://culturedcode.com/things/support/articles/2409117/)（"Tweaked projects' progress rings"）。
    **Support:** direct evidence（二手实测 + 一手存在性佐证）. **Confidence:** high.
    > Logbook 中项目行是否显示填满的圆环+✓：未找到直接截图描述的一手来源，但从"项目即条目 + progress ring 是项目的固定图标"可合理推断（researcher inference，medium confidence）。

20. **项目内的任务不随项目重复罗列**（见 Finding 4）；且取消项目时会询问如何处理剩余子任务（取消还是完成它们）。
    **Sources:** [Matthew Cassinelli](https://matthewcassinelli.com/how-to-cancel-things-tasks/)；[iPad Release Notes 3.15.9](https://culturedcode.com/things/support/articles/2409117/)（修复"取消父项目时已完成子任务被错误标记为取消"）。
    **Support:** direct evidence. **Confidence:** high.

### 7. 与其他视图的一致性

21. **Logbook 与 Today/Anytime 等共用同一套行组件与"task as object"交互**：同一套勾选框、同一套点击展开卡片、同一套多选/右键菜单（"Restored the Log Completed command in context menus"）；官方 3.23 起 Mac/iOS 连"列表内与展开态的待办渲染代码"都统一了。
    **Sources:** [iPad Release Notes 3.23 / Mac Release Notes – Things Support](https://culturedcode.com/things/support/articles/2409117/)；[MacStories](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)。
    **Support:** direct evidence（一手）. **Confidence:** high.

22. **差异的本质 = 数据维度翻转而非视觉差异**：Today/Upcoming 按"何时开始/截止"组织（相对日期、星标、红旗、日历事件置顶、This Evening 分区），Logbook 按"何时了结"组织（精确完成日期、无星标/红旗、无日历事件）。侧边栏中 Logbook 有自己的图标，与其他默认列表并列。Anytime/Someday 会隐藏非活跃项目，Logbook 则是唯一的"全量历史"。
    **Sources:** [Understanding the Default Lists – Things Support](https://culturedcode.com/things/support/articles/4001304/)；[MacStories review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)。
    **Support:** interpretation（基于一手文档对各列表定义的综合）. **Confidence:** high.

---

## Contradictions

- **取消任务的删除线**：有 Reddit 用户（2020 年中）称 iOS 上取消的待办无删除线、只有 X（[r/thingsapp](https://www.reddit.com/r/thingsapp/comments/hvws05/)）；但官方 3.13.5（2020-10）发布说明明确"Canceled to-dos now show strikethrough, as on the Mac"。结论：该差异是版本演进造成的，当前版本 iOS/Mac 一致均有删除线（一手来源为准）。
- **取消条目去向**：某第三方 MCP 工具文档称"Canceled to-dos are moved to the Trash"（[Glama MCP](https://glama.ai/mcp/servers/wbopan/things-mcp/tools/update_todo)），与官方"completed or cancelled… end up here (Logbook)"矛盾。以官方文档为准：取消进 Logbook，删除才进 Trash。第三方工具文档有误。
- **未勾选确认弹窗**：仅 IXD@Pratt 单源称取消勾选有确认提示，未获其他来源证实；存疑记录。

## Missing evidence

- Logbook 日期分组标题的精确文案格式（是否用"今天/昨天"相对词）——未找到一手来源。
- 行上是否显示完成时刻（time of day）、是否显示标签（tags）——未找到一手来源。
- Logbook 空状态的具体文案与插图——仅有间接证据（存在文案），无截图/原文。
- Logbook 中完成项目行的精确视觉（圆环是否显示为填满+✓）——合理推断，无直接一手截图描述。
- Logbook 是否支持行内搜索/筛选（除全局 Quick Find Continue Search 外）——未找到一手来源，疑似不支持（用户只能滚动浏览）。

## Sources

- Kept: [Understanding the Default Lists – Things Support](https://culturedcode.com/things/support/articles/4001304/) — 官方对 Logbook 唯一直接的定义段落（归档范围、无限期保留、清空方式）
- Kept: [iPad Release Notes – Things Support](https://culturedcode.com/things/support/articles/2409117/) — 大量 Logbook 相关 bug 修复记录，是还原界面细节（行内日期、副标题、勾选框、删除线、父子归档关系）最强的一手来源
- Kept: [Mac Release Notes – Things Support](https://culturedcode.com/things/support/articles/1100684/) — Log Completed 命令、Manual/Daily 日志设置、标题淡化等佐证
- Kept: [Things 3.5 – Things Blog](https://culturedcode.com/things/blog/2018/04/things-3-5/) — 官方说明 Logbook 永远显示精确完成日期的设计决策
- Kept: [The Quick Find Update – Things Blog](https://culturedcode.com/things/blog/2019/12/the-quick-find-update/) — Logged Projects 列表的官方定位（"past achievements"）
- Kept: [MacStories: Things 3 review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/) — 权威二手：task-as-object 卡片交互、整体视觉语言
- Kept: [The Nerdy Student: Things 3 review](https://www.thenerdystudent.com/2017/07/things-3/) — 带 Logbook 截图的实测：倒序、撤销完成、项目底部 logged 区
- Kept: [Matthew Cassinelli: How to cancel tasks](https://matthewcassinelli.com/how-to-cancel-things-tasks/) — 取消交互细节（长按勾选框、X 图标、快捷键），含 Cultured Code 官方回复
- Kept: [Things AppleScript Commands – Things Support](https://culturedcode.com/things/support/articles/4562654/) — 数据模型佐证：status(open/completed/canceled)、cancellation date、log completed now
- Kept: [r/thingsapp: Logbook bugs（含截图）](https://www.reddit.com/r/thingsapp/comments/92vpka/) — 项目归档后子任务不再单独列出的实测
- Kept: [FAQ – Things Support](https://culturedcode.com/things/support/articles/2967034/) — 删除/恢复语义
- Rejected: Glama/MCP 第三方工具文档 — 与官方矛盾（取消→Trash 之说有误）
- Rejected: things3-cloud (docs.rs) / things-cli — 第三方实现，仅作分组行为的侧面佐证，不作为界面证据
- Deprioritized: PCMag / The Verge / appsntips 评测 — 未涉及 Logbook 细节
- Deprioritized: Home Assistant logbook issue、Obsidian 插件等 — 同名不同物

## Next steps

- 若需像素级参考：在 Mac 上装 Things 3 试用版（15 天免费）截图 Logbook 的日期分组标题、完成项目行、空状态——这是填补 Missing evidence 最快的方式。
- 竞品对照：Todoist 的 completed tasks 视图与 Linear 的 archive 交互，用于评估"三段式 vs 逐日分组"哪种更适合 Web。

---

## 对 Taskora 的启示

> 映射到 Taskora 现状：页面标题 + 今天/昨天/更早三段平铺任务行（勾选框可撤销、标题、项目/领域标签）。以下按投入产出排序。

1. **从"三段式"改为"逐日分组、无限滚动"**（对齐 Things 的核心信息架构）。今天/昨天仍可作为前两组的相对词标题（Today/Yesterday），之后逐日一个分组标题（星期+日期，远期带年份）。理由：Things 官方将 Logbook 定位为"完整成就档案"，用户场景是回顾与找误勾——逐日分组让"我那天都干了什么"一目了然，而"更早"这个无底洞分组把所有历史压成一锅粥。若担心性能，做按日虚拟滚动/分页加载（官方也曾专门优化 Logbook 长列表性能，见 iPad 3.17.9）。
2. **行内加"完成日期/时间"，放在标题之前或与标题同行**（Things 的行结构：日期紧贴标题）。远期也显示完整日期而非缩写——这是 Things 3.5 官方明确修正过的体验问题。
3. **引入三态模型：open / completed / canceled。**取消的任务进 Logbook 而非删除：X 图标 + 删除线 + 淡化，与完成（✓ + 淡化、无删除线）明确区分。这是 Things 自 2008 年 0.9.3 就确立的语义："取消 ≠ 完成 ≠ 删除"，让 Logbook 成为诚实的历史记录。Taskora 目前的"取消"若只是完成的另一叫法，建议拆开。
4. **完成的项目作为 Logbook 一等条目呈现**：用区别于任务的图标（Things 用填满的进度圆环）+ 标题 + 完成日期；项目归档后其内部任务不再逐条占据 Logbook（点击项目行进项目只读视图查看）。避免"完成一个 50 任务的项目刷屏 Logbook"。可进一步提供「已完成项目」筛选/独立视图（对齐 Logged Projects，"过去成就总览"是官方给它的定位，适合周报/复盘场景）。
5. **点击行展开详情卡片（只读优先），点击勾选框撤销完成**——Things 的"task as object"范式：整行是对象，点开看全部信息（笔记、子任务、精确完成时间戳）。Taskora 可在 Web 端用侧边抽屉/居中卡片实现；撤销完成后行从 Logbook 淡出回到原列表。
6. **视觉收尾**：完成态整行淡化（灰）而非仅勾选框变色；完成/撤销加一段短动画（Things 连"完成动画丢失"都作为 bug 修复）；空状态放一句有温度的文案+插图（Things 确认空 Logbook 有文案而非空白），如"完成的任务会在这里留下足迹"。
7. **保持与其他视图同一套行组件**（Things 官方连渲染代码都统一了）：差异只体现在数据维度（完成日期 vs 开始日期/截止时间）与状态样式（淡化 vs 星标/红旗）。这能降低实现成本，也让用户零学习成本。
8. **可选进阶**：设置项"完成后何时归档"（立即/每天/手动 + "Log Completed"命令）——对手动派用户，完成的任务划线淡化留在 Today 底部直到主动归档，是 Things 多年保留的受欢迎行为；以及 Logbook 全局搜索（Things 用 Quick Find 的 Continue Search 覆盖 Logbook，且搜索结果单独成组）。
