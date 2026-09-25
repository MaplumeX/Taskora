# Research: Things 3 中「计划时间(When)」在任务条目上的视觉展示

> 资料性质标注约定:【官方】= Cultured Code 官方支持站/博客的文字描述;【用户描述】= 第三方评测、论坛中使用者对界面的文字描述;【截图观察】= 来自截图或设计分析的视觉细节,官方文字未明确写出。
>
> 注:本文件为任务请求指定的副本;权威输出见 subagent artifacts 目录下同名 research.md,两者内容一致。

## Summary

Things 3 用三种互相独立的日期概念:When(计划开始日期,决定任务哪天进入 Today 列表)、Reminder(依附于 When 的定时提醒通知)、Deadline(必须完成的截止日)。在列表行(row)上,When 的展示极为克制:未来日期以「小日历图标 + 相对日期文字」显示在标题下方的次要行(灰色);Today 计划用黄色星星标记;This Evening 归入 Today 底部专区;提醒时间**不显示在行上**(需展开任务才能看到);Deadline 以红旗图标 + 倒计时天数显示,到期/逾期时变红;重复任务副本带灰色循环图标。整体遵循「界面 95% 中性色,颜色只承载语义」的设计哲学。

## Findings

### 1. When 的概念模型(三日期分离)

1. **Claim:** When(官方也称 start date)回答的问题是「我哪天*开始*做这件事」,而非「哪天必须完成」。When 不是日历预约,只标记一个「开始工作日」。**Sources:** [Scheduling To-Dos in Things](https://culturedcode.com/things/support/articles/2803579/) ("When can I start working on this? … a start date in Things merely indicates the day on which you want to begin work on a to-do")。**Support:** 直接证据【官方】。**Confidence:** high。

2. **Claim:** When 的取值对应四个默认列表:Today / This Evening(Today 内的可选分区)/ 具体未来日期(→ Upcoming)/ Someday;清除日期后任务归入 Anytime。**Sources:** [Scheduling To-Dos](https://culturedcode.com/things/support/articles/2803579/)("The date picker offers shortcuts for Today, This Evening, and Someday. By selecting a start date from the calendar grid, the to-do is assigned to Upcoming. The Clear button removes any existing schedules and assigns the task to Anytime.")。**Support:** 直接证据【官方】。**Confidence:** high。

3. **Claim:** 数据模型上,Start 取值为 `On Date` / `Anytime` / `Someday`;`Evening` 是 On Date 之上的一个布尔标记;Reminder 与 When 共享日期、只额外带时间组件。**Sources:** [Things Shortcuts Actions](https://culturedcode.com/things/support/articles/9596775/)("Start: On Date, Anytime, or Someday… Evening: Whether or not the item is planned for the evening… Reminder Date: The date component is equal to the item's start date, and the time component is set to when the reminder will fire.")。**Support:** 直接证据【官方】。**Confidence:** high。

4. **Claim:** Reminder 依附于 When(「A reminder is set via When. It reminds you to *start* a particular task.」),不是闹钟,只发一次通知;Deadline 不能设提醒。**Sources:** [Setting a Reminder](https://culturedcode.com/things/support/articles/2803585/)。**Support:** 直接证据【官方】。**Confidence:** high。

5. **Claim:** Deadline 回答「哪天必须*完成*」,通常与外部后果绑定(账单滞纳金等);带 deadline 的任务保持 active、留在 Anytime;deadline 当天会自动出现在 Today。When 永远不会「逾期」(它只是调度机制),Deadline 才会逾期。**Sources:** [Scheduling To-Dos](https://culturedcode.com/things/support/articles/2803579/);[MPU Talk: The When/Start Date](https://talk.macpowerusers.com/t/q-for-things-3-users-the-when-start-date/19654)。**Support:** 直接证据【官方 + 用户描述】。**Confidence:** high。

6. **Claim:** Today 是一个跨全 app's 过滤器:start date、deadline 或重复规则命中今天日期的任务都会出现。**Sources:** [An In-Depth Look at Today, Upcoming, Anytime, and Someday](https://culturedcode.com/things/support/articles/4001304/)。**Support:** 直接证据【官方】。**Confidence:** high。

### 2. 任务条目(row)上 When 的展示细节(核心问题)

> ✅ 2026-09-25 已用官方截图实证修正,截图存于本目录 `images/`。

7. **Claim:** 已排期任务在行内显示一个「日期指派(date assignment)」,点击它可以重新打开 When 选择器;未排期任务展开后显示日历图标按钮。**Sources:** [Scheduling To-Dos](https://culturedcode.com/things/support/articles/2803579/)("Hit the calendar icon inside a task if it doesn't have a date yet. Hit the date assignment inside the task if it's already scheduled.")。**Support:** 直接证据【官方,但未描述视觉样式】。**Confidence:** high(功能)/视觉样式见下条。

8. ~~(旧版猜测:标题下方次要行 + 日历图标,medium 置信)~~ **已实证修正。** 带未来 When 日期的任务行采用**两段式布局**,见 `images/repeating-list.png`(官方博客 Repeating 列表截图):
   - **行首**:复选框右侧是一个**日期 chip**:圆角浅灰底胶囊,内嵌**短绝对日期**(如 `Sep 2`、`Aug 19`,「月缩写 + 日」),灰色文字;日期 chip 右侧紧跟一个**蓝色循环图标**(重复任务专用,普通任务无此图标)再是黑色标题。
   - **行尾右对齐**:如有 deadline,显示**灰色旗帜图标 + 截止日期文字**(如 `Oct 1`);Today 视图中到期日为**红色旗帜 + 红色 `today`**(见 `images/today.jpg`)。
   - **标题下方的次要行**确实存在,但**只放归属上下文**(项目/Area 名,如 `Vacation in Rome`、`Work`,灰色小字),不放日期——见 `images/today.jpg`、`images/upcoming.jpg`。
   - **When 视图内不重复显示日期**:Today 视图里 When=今天的行**没有任何日期 chip**(列表本身即语境);Upcoming 视图按日期分组(`19 Tomorrow`、`20 Thursday` 大标题 + 细分割线),组内行同样不带日期 chip——日期只出现在「语境不足以表达」的列表里(如项目内、Repeating 列表)。**Sources:** 官方截图 `images/repeating-list.png` / `images/today.jpg` / `images/upcoming.jpg` / `images/anytime.jpg`。**Support:** 截图实证【官方配图】。**Confidence:** high。

9. **Claim:** Today 计划的语义色是**黄色星星**:在 Anytime 列表中,属于 Today 的任务「前面带一颗黄色星星」("Today's tasks will appear in Anytime with a yellow star in front of them")。**Sources:** [An In-Depth Look…](https://culturedcode.com/things/support/articles/4001304/)。**Support:** 直接证据【官方】。**Confidence:** high(有星、黄色);星星的确切位置(行首 vs 行尾)官方措辞为 "in front of them",**Confidence:** medium(研究者注:按官方措辞记录为「前面」)。

10. **Claim:** 相对日期格式化规则:官方没有成文规则。综合截图与用户描述,Things 采用典型相对格式——Today / Tomorrow / 一周内显示星期几 / 更远显示「月 日」短日期;Deadline 倒计时为 "x days left",当天显示红色 "today",逾期显示红色逾期天数。**Sources:** [Michael Linenberger 博客客座文章](https://www.michaellinenberger.com/blog/guest-post-using-things-3-apps-for-1mtd-and-myn-by-charles-olsen.html)("The deadline will be displayed as a countdown — for example, 3 days left. On the day of the deadline, it will say today in red. If the task is still incomplete after the deadline, it will display the number of days past due in red.");[Reddit: Countdown weeks/days in Things?](https://www.reddit.com/r/thingsapp/comments/b9qw1p/countdown_weeksdays_in_things/)。**Support:** 用户描述【非官方】;「Today/Tomorrow/星期几」的 When 格式化细节主要来自截图观察。**Confidence:** medium(deadline 倒计时,高);medium-low(When 的精确切换阈值)。

11. **视图差异汇总:**
    - **Today 视图**:When=今天的任务不再显示日期文字(列表本身即语境);This Evening 任务移到底部独立分区("move into their own section at the bottom – still present… but unobtrusive")。**Sources:** [An In-Depth Look…](https://culturedcode.com/things/support/articles/4001304/)【官方】。**Confidence:** high。
    - **Upcoming 视图**:按日期分组,顶部单独列出「从明天开始的未来七天」,每天一个区块;可直接拖拽任务到另一天改期。**Sources:** [An In-Depth Look…](https://culturedcode.com/things/support/articles/4001304/)【官方】。**Confidence:** high(分组结构);日期标题的精确格式(星期几 vs 月日)为截图观察,medium。
    - **Anytime 视图**:Today 任务带黄色星星;有 deadline 的任务留在 Anytime 并显示 deadline 标记。**Sources:** 同上【官方】。**Confidence:** high。
    - **Someday / 休眠项目**:视觉上「退居次要位置」("designed to take a backseat visually",即灰淡化);项目内未激活(未来日期)任务排在激活任务之后。**Sources:** 同上【官方,措辞为定性描述】。**Confidence:** high(有视觉降级)/medium(具体呈现为灰色系截图观察)。
    - **Inbox**:纯收集箱,任务一旦设了未来日期或移入列表就会离开 Inbox。**Sources:** 同上【官方】。**Confidence:** high。
    - **项目内列表**:未来日期的 to-do 显示日期指派(同 Finding 8),项目本身有未来 start date 时会从侧栏隐藏("projects with start dates disappear from the sidebar… while they're in hibernation mode")。**Sources:** 同上【官方】。**Confidence:** high。

12. **Claim:** 整体配色纪律:界面 95% 中性色(黑/白/灰),颜色仅承载语义——黄=Today,红=Deadline/逾期,靛蓝(indigo)=Evening,蓝=标签。**Sources:** [Things 3: The Art of Focused Simplicity](https://blakecrosley.com/guides/design/things)。**Support:** 第三方设计分析(黄色星星与红色 deadline 与官方文档互相印证;indigo=Evening 仅见于此分析)。**Confidence:** medium-high(黄/红)/low-medium(indigo=Evening)。

### 3. 提醒时间(Reminder)的展示

13. **Claim:** 设了 reminder 的任务,其提醒时间**不会显示在列表行上**(Today 或任何视图都不显示),必须点开/展开任务才能看到;这是有意的克制设计,用户在论坛中多次抱怨但无解。**Sources:** [MPU Talk: Things 3 - can't see times in Today view?](https://talk.macpowerusers.com/t/things-3-cant-see-times-in-today-view/37288)("It appears I have to click and expand the task to see any applicable time reminder. I assume this is by design to keep the main view cleaner.");[Reddit: See times in list](https://www.reddit.com/r/thingsapp/comments/t8durp/see_times_in_list/)("Not without clicking on the task.")。**Support:** 用户描述(两个独立来源一致)。**Confidence:** high。研究者注:官方文档对行内 reminder 展示完全未着墨,与「行上不显示」的观察一致;行上是否有铃铛/时钟类微图标,未找到可靠证据——倾向「连图标也没有」,但标记为缺失证据。

14. **Claim:** Reminder 的通知本体是一次性系统通知,可 snooze 15 分钟/1 小时/3 小时/次日。**Sources:** [Setting a Reminder](https://culturedcode.com/things/support/articles/2803585/)。**Support:** 直接证据【官方】。**Confidence:** high。

### 4. Deadline 的展示

15. **Claim:** Deadline 通过任务内的**旗帜按钮(flag button)**设置;行上以红旗图标 + 倒计时文字("x days left")显示;到期日显示红色 "today";逾期后显示红色逾期天数。**Sources:** [Scheduling To-Dos](https://culturedcode.com/things/support/articles/2803579/)(flag button,官方);[Michael Linenberger 客座文章](https://www.michaellinenberger.com/blog/guest-post-using-things-3-apps-for-1mtd-and-myn-by-charles-olsen.html)(倒计时与红色规则,用户描述);[Fran's Realm](https://iamfran.com/notes/things-repeating-tasks/)("that small red indicator",用户描述)。**Support:** 官方(设置入口)+ 用户描述(视觉规则)。**Confidence:** high。

16. **Claim:** Things 有一个隐藏的特殊列表 **Deadlines**(通过 Quick Find 搜索 "Deadlines" 访问),按时间顺序列出所有带截止日的任务与项目。**Sources:** [Scheduling To-Dos](https://culturedcode.com/things/support/articles/2803579/)("Deadlines shows all items with a deadline, in chronological order.")。**Support:** 直接证据【官方】。**Confidence:** high。

### 5. 重复任务的图标展示

17. **Claim:** Things 3.23(2025-2026 年间发布)重新设计了重复任务的行内展示:**恢复普通复选框**(可直接提前完成),重复规则标识改为**标题前的灰色循环(repeat)小图标**;此前版本是「用循环符号替代复选框」。**Sources:** [Things Blog: Repeating To-Dos, Refined](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/)("Repeating to-dos now show a regular checkbox… All generated copies of repeating to-dos now show a little grey repeat icon, so you can tell where they came from.");[iDrop News](https://www.idropnews.com/news/things-3-repeating-tasks-update-2026/267466/)(旧 UI 对比描述)。**Support:** 直接证据【官方博客】。**Confidence:** high。

18. **Claim:** 重复任务模板集中管理在隐藏列表 **Repeating**(Quick Find 搜 "Repeating"),按 Area 分组,同时显示已生成的未来副本。**Sources:** [Things Blog: Repeating To-Dos, Refined](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/)。**Support:** 直接证据【官方】。**Confidence:** high。

## Contradictions

- **Deadline 倒计时的默认颜色**:Linenberger 客座文章称倒计时期间为普通显示、仅到期/逾期变红;而 [r/todoist 讨论中的截图对比](https://www.reddit.com/r/todoist/comments/1h7gbuy/my_thoughts_on_deadlines_why_todoist_should/)称 "All deadlines show up as red with a countdown"(即始终红色)。两者矛盾,官方无成文规则;可能版本差异或观察误差。**未解决**,建议以实机截图核实。
- **黄色星星的位置**:官方措辞 "yellow star in front of them",但部分截图中星星在行尾。未解决,低优先级。

## Missing evidence

- When 相对日期格式化的**精确切换阈值**(几天后从「星期几」切换为「月 日」、跨年是否带年份):官方无文档,仅有截图观察,medium-low 置信。
- 行上是否有任何 reminder 存在性微图标(铃铛/时钟):未找到可靠证据,倾向没有。
- 行内日期文字的精确字号/色值:仅设计分析文章给出的近似 token(如 caption 字号、semantic colors),非官方规范。
- App Store 官方截图说明文字未单独抓取核实(截图本体无法通过文本检索确认)。

## Sources

- Kept: [Scheduling To-Dos in Things — Things Support](https://culturedcode.com/things/support/articles/2803579/) — When/Reminder/Deadline 三概念与 When picker 行为的一手定义
- Kept: [An In-Depth Look at Today, Upcoming, Anytime, and Someday — Things Support](https://culturedcode.com/things/support/articles/4001304/) — 各视图差异、黄色星星、视觉降级
- Kept: [Setting a Reminder — Things Support](https://culturedcode.com/things/support/articles/2803585/) — reminder 依附 When、不可排序、可 snooze
- Kept: [Things Shortcuts Actions — Things Support](https://culturedcode.com/things/support/articles/9596775/) — Start/Evening/Reminder Date/Deadline 的数据模型
- Kept: [Repeating To-Dos, Refined — Things Blog](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/) — 3.23 重复任务行内 UI 变更(复选框回归 + 灰色循环图标)
- Kept: [Things 3: The Art of Focused Simplicity — blakecrosley.com](https://blakecrosley.com/guides/design/things) — 设计分析:色彩语义体系、行结构(第三方,部分为作者推断的实现示意)
- Kept: [MPU Talk: can't see times in Today view?](https://talk.macpowerusers.com/t/things-3-cant-see-times-in-today-view/37288) 与 [Reddit: See times in list](https://www.reddit.com/r/thingsapp/comments/t8durp/see_times_in_list/) — reminder 时间不显示在行上
- Kept: [Michael Linenberger 客座文章](https://www.michaellinenberger.com/blog/guest-post-using-things-3-apps-for-1mtd-and-myn-by-charles-olsen.html) — deadline 倒计时/红色规则的用户描述
- Kept: [Creating Repeating To-Dos — Things Support](https://culturedcode.com/things/support/articles/2803564/) — 重复任务概念
- Kept: [iDrop News: Things 3.23 repeating tasks](https://www.idropnews.com/news/things-3-repeating-tasks-update-2026/267466/) — 新旧重复任务 UI 对比
- Rejected/deprioritized: docs.rs things3-cloud(第三方 Rust 重实现,非 Things 本体,不构成本产品 UI 证据);GTD Setup Guide PDF(侧重方法论而非像素细节);多个 Reddit 使用习惯帖(仅背景)

## 对自研任务应用的参考要点

1. **三日期分离是核心心智模型**:把「计划哪天做(When)」「几点提醒(Reminder)」「必须完成(Deadline)」拆成独立字段。When 只回答"start",永不逾期——消除了多数应用里 due date 一词两义(做 or 交)的歧义。数据模型上 Reminder = When 日期 + 时间组件,而非独立日期。
2. **颜色即语义,宁缺毋滥**:列表行 95% 中性色;黄星=今天计划、红旗/红字=截止、灰淡化=休眠(Someday/未来项目)。用户扫一眼即可分类,无需阅读文字。
3. **行上只放「改变任务状态归属」的信息,其余藏进展开态**:连 reminder 时间都故意不显示在行上以保持列表干净——但注意这在用户社区是真实抱怨点;自研时可折中:行上显示一个极轻量的提醒图标,时间仍放展开态。
4. **相对日期 + 倒计时替代绝对日期**:Deadline 显示 "x days left" 比 "12/15" 更有时间感;到期/逾期用红色升级。When 用 Today/Tomorrow/星期几的相对格式降低认知换算。
5. **列表即过滤器,日期即路由**:Today 是全局过滤器(start/deadline/重复规则命中今天即出现),Upcoming 是按日分组的时间轴(顶部单列未来 7 天,支持拖拽改期)——行上的日期展示因此可以随视图语境省略(Today 内不再重复显示"今天")。
6. **视觉降级代替隐藏**:Someday 与未来项目通过灰淡化「退居次要」而非消失,保留可发现性;项目内未激活任务沉底排列。
7. **重复任务的演进教训**:Things 曾用循环图标替换复选框(无法提前完成),3.23 改为「普通复选框 + 标题旁灰色循环图标」——自研时应让重复任务保持与普通任务一致的完成交互,只用辅助图标标注来源。
8. **隐藏的汇总视图**:Deadlines、Repeating、Tomorrow 作为仅搜索可达的特殊列表,不占主导航但满足高级检视需求,值得借鉴。

## Next steps

- 实机或官方 App Store 截图核实三处未决细节:When 相对日期切换阈值、deadline 倒计时默认颜色(灰 vs 红)、星星在行内的位置。
- 如需像素级参考,抓取官方支持文章配图(dates-alllists.jpg / dates-today.jpg / dates-upcoming.jpg 等)逐一标注。
