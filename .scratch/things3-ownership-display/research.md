# Research: Things 3 任务行「归属上下文」展示规则(Project/Area/Heading)

> 调研范围:补全 `.scratch/things3-when-display/research.md` 未覆盖的「行上归属上下文」细节。
> 资料性质标注约定:
> - 【官方】= Cultured Code 官方支持站/博客/发布说明的文字描述(一手)
> - 【官方截图】= 官方支持文章/博客配图,本目录或 `.scratch/things3-when-display/images/` 已存档
> - 【用户实测】= Reddit r/thingsapp、MPU Talk、第三方评测中带界面描述的实测
> - 【推测】= 研究者基于证据链的推断(明确标注)
>
> 注:本文件为任务请求指定的副本,写入 subagent artifacts 输出路径;内容同时可落到 `.scratch/things3-ownership-display/research.md`。

## Summary

Things 3 在任务行上以「标题下方一行灰色小字」展示**直接父级**的归属上下文——且只展示**一层**。规则高度克制:任务属于某 **Project** 时显示 Project 名;任务直接挂在 **Area** 下(不在任何项目里)时显示 Area 名;**Heading 永远不出现在行上**(这是社区长期抱怨点,官方有意为之)。归属行只在「平铺列表」(Today / Upcoming / 未分组的 Anytime / Logbook)出现——一旦列表已按父级分组(Anytime/Someday 的默认分组、Today 开启「按项目/领域分组」),归属信息上移到分组标题,行上不再重复。iOS 与 macOS 行结构一致。无归属任务(Inbox / 无项目无 Area)行上完全不出现归属行。

## Findings

### 1. 项目内任务行是否显示 Heading 上下文?

1. **Claim:** 在 Today / Upcoming 等平铺列表里,属于某 Heading 的任务行**只显示 Project 名,不显示 Heading 名**——行上没有 "Project > Heading" 这类层级路径。
   **Sources:** [Task Heading in Today View – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/aszdob/task_heading_in_today_view/)("in the today view, the Heading doesn't show up, just the Task and Project";回复:"You're not missing anything. Headers simply [don't show]");[I'd love to see under which heading a task is in the today view – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/1c51uau/id_love_to_see_under_which_heading_a_task_within/)("it only shows the project the task is connected to, but [not the heading]")。
   **Support:** 用户实测(两个独立线程一致)。**Confidence:** high。
   > 研究者注:官方支持文档对行上归属展示完全未着墨,无任何一处提到会在行上显示 Heading;结合社区一致抱怨,可确证「仅显示 Project 名、不显示 Heading」是当前行为。这是**有意省略**而非缺失。

2. **Claim:** Heading 只是 Project 内部的可视分组结构,不是一个独立的归属层级;它存在于项目视图内部,不构成任务在其它视图里的「上下文标签」。
   **Sources:** [Using Headings in Projects – Things Support](https://culturedcode.com/things/support/articles/2803577/)("Headings are only available in projects. This feature is not available in areas or any other list.");[What's New / Headings – Things Features](https://culturedcode.com/things/features/)("Headings… give you a nice visual structure… the plan becomes perfectly clear",强调其是项目内的视觉结构)。
   **Support:** 直接证据【官方】——官方将 Heading 定位为项目内的视觉分组工具,而非归属维度。**Confidence:** high(定位),并支撑 Finding 1 的解释。

3. **Claim:** 由于行上不显示 Heading,同一项目下不同 Heading 里**同名任务**在 Today 视图中无法区分(都显示同一 Project 名)。
   **Sources:** [I'd love to see under which heading… – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/1c51uau/id_love_to_see_under_which_heading_a_task_within/)("some of the tasks underneath these headings are named the same… there's no way for me to differentiate between those tasks in the Today view")。
   **Support:** 用户实测(行为后果的直接陈述)。**Confidence:** high。
   > 对自研的启示:若项目内有子分组(heading/section),平铺视图里只显示项目名会造成同名任务歧义——这是 Things 的已知痛点,自研可考虑显示最近一层分组或提供开关。

### 2. Logbook 里的归属显示

4. **Claim:** Logbook 行内有「副标题(subtitle)」用于显示父列表(项目/领域)名,与完成日期同行内呈现。
   **Sources:** [iPad Release Notes 3.13.10 – Things Support](https://culturedcode.com/things/support/articles/2409117/)("items in the Logbook wouldn't display the correct **subtitle**"——证明行内有副标题,即父列表名);[iPad Release Notes 3.17.3](https://culturedcode.com/things/support/articles/2409117/)("extra space could sometimes appear between the **completion date** and a to-do's title"——证明完成日期与标题相邻同处一行)。
   **Support:** 直接证据【官方,由 bug 修复记录反推行结构】。**Confidence:** high。
   > 此条已在 `.scratch/logbook/things3-logbook-research.md` Finding 7 确立;此处补充:官方对 Logbook 归属采用的是**行内副标题**而非「标题下方灰色小字行」——措辞("subtitle" / 行内日期紧贴标题)指向更紧凑的行内布局。但精确像素细节(副标题是否换行在标题下方)官方未直接给出截图描述,标 medium。

5. **Claim:** 项目整体归档(完成/取消)后,其内部任务**不再逐条出现在 Logbook**,而是随项目条目一起呈现;单独完成的任务才逐条进入 Logbook。
   **Sources:** [iPad Release Notes 3.13.9 – Things Support](https://culturedcode.com/things/support/articles/2409117/)("Fixed a bug where logged to-dos would appear individually in the Logbook even when their parent project was also logged"——正确行为是父子同归档时子项不单独列出);[Possible bugs with projects and Logbook – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/92vpka/)(截图实测)。
   **Support:** 直接证据【官方发布说明】。**Confidence:** high。
   > 已在 logbook research Finding 4 确立,此处为归属语境下的复述:Logbook 中「归属」的呈现单位可以是**项目本身**(作为一条带进度圆环的条目),此时任务不再带各自的归属副标题刷屏。

6. **Claim:** Logbook 与其它视图共用同一套行组件与「task as object」交互(点击展开详情卡片);差异只在数据维度(完成日期)与状态样式(✓/X、淡化、删除线),归属副标题逻辑一致。
   **Sources:** [iPad Release Notes 3.23 – Things Support](https://culturedcode.com/things/support/articles/2409117/)("Unified the display and editing of to-dos – both in lists and when expanded");[MacStories: Things 3 review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)(task-as-object 卡片交互)。
   **Support:** 直接证据【官方发布说明 + 权威评测】。**Confidence:** high。

### 3. iOS/iPad 与 macOS 差异

7. **Claim:** 任务行的信息结构(标题 + 归属副标题)在 iOS(iPhone/iPad)与 macOS 上**一致**;iPhone 同样在项目/领域归属下显示归属上下文。
   **Sources:** [The Sweet Setup: A Guide to Capturing Tasks in Things 3 for iPad and iPhone](https://thesweetsetup.com/a-guide-to-capturing-tasks-in-things-3-for-ipad-and-iphone/)("The anatomy of a to-do on iOS is exactly the same as it is on the Mac.");[Things 3.5 – Things Blog](https://culturedcode.com/things/blog/2018/04/things-3-5/)("Just like the Mac, iOS now allows you to change the layout of your Today list… group them automatically by area or project"——分组逻辑跨平台一致)。
   **Support:** 直接证据【用户实测 + 官方博客(分组行为跨平台)】。**Confidence:** high(行解剖一致)。
   > 研究者注:官方支持文章的截图(Today/Upcoming/Anytime)为 macOS;iPhone 上「标题下方灰色小字」这一**精确像素呈现**未找到官方 iPhone 截图直接佐证。基于「行解剖完全一致」+「分组逻辑跨平台一致」+「设置项跨设备同步(见 Finding 9)」,推断 iPhone 紧凑布局下归属显示行为一致——标 **medium-high**,精确小字行为属【推测】成分。

8. **Claim:** 「按项目/领域分组 Today 列表」这一影响归属呈现位置的设置,在 Mac 上开启后**同步到 iOS**(iOS 端无独立开关,跟随 Mac)。
   **Sources:** [An In-Depth Look… – Things Support](https://culturedcode.com/things/support/articles/4001304/)("Enable this in Things → Settings → General. **This setting will sync to your other devices.**");[Can't filter by area? – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/85wj9b/)("In the Mac app you can set the Today screen to separate tasks by area, and this option then syncs to your iOS app, but there's no way to set this from within the iOS app")。
   **Support:** 直接证据【官方】+ 用户实测(iOS 无独立开关)。**Confidence:** high。

### 4. 无归属任务(Inbox / 无项目无 Area)

9. **Claim:** Anytime 默认排序中,「无父级(loose,既不属于 project 也不属于 area)的任务浮在顶部」,其后才是按父级分组的有归属任务——证明无归属是一个独立可识别的状态,不挂任何上下文。
   **Sources:** [An In-Depth Look… – Things Support](https://culturedcode.com/things/support/articles/4001304/)("loose to-dos without a parent (project or area) float at the top, and then to-dos are grouped under their direct parent list")。
   **Support:** 直接证据【官方】。**Confidence:** high。

10. **Claim:** Inbox / 无项目无 Area 的任务,行上**完全不出现归属上下文行**(标题下方那行小字整个不渲染)。
    **Sources:** **官方截图** `.scratch/things3-when-display/images/upcoming.jpg` 中,`Resubmit design proposal` 等无父级任务行标题下方无任何灰色小字;[An In-Depth Look… – Things Support](https://culturedcode.com/things/support/articles/4001304/)(Inbox 是"unprocessed… haven't added any details"的纯收集箱,归属未设);[Need some help getting a hang of Things – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/x61gs4/)("Inbox is for emptying your brain… tasks you haven't 'processed' yet by sorting to areas/projects")。
    **Support:** 官方截图观察 + 官方文档(Inbox 无归属语义)互证。**Confidence:** high(无归属→无归属行)。
    > 研究者注:截图中无归属任务确实无小字行;「行整个不渲染(而非渲染空行)」与 Things 紧凑行设计一致,但「完全不渲染空白占位」这一实现细节属【推测】成分,行为结果(行上看不到任何归属文字)为高置信。

### 5. 点击归属文字的行为

11. **Claim:** **未找到证据**表明「标题下方的父级名」可点击跳转到该 Project/Area。官方文档对该副标题完全未描述其交互;社区讨论中点击任务行是「展开任务卡片」(task-as-object),而非跳转父级。
    **Sources:** [MacStories: Things 3 review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)(点击任务=弹出卡片,"pop out into a card-like form",未提及点击父级名跳转);[Moving Tasks to Areas/Projects – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/1idh7oz/)(用户抱怨改归属必须点底部 "Move" 按钮、"The project/area, however, is not [shown in task detail]"——侧面印证父级名不是可直接交互/编辑的入口)。
    **Support:** 缺失证据 + 间接旁证。**Confidence:** low(倾向「不可点击跳转」,但无直接证实)。
    > 研究者注:多轮检索(deep linking、URL scheme、Move、task detail)均未出现「点击行内父级名跳转」的描述;Things 的导航范式是 Quick Find 与侧边栏,行内父级名是**只读上下文标签**。倾向判断为**不可点击**,但因属「证据缺失」故保守标 low。需实机验证。

### 6. Area 归属 vs Project 归属的显示差异

12. **Claim:** 行上只显示**直接父级一层**:任务直接属于 Area(不在任何项目)→ 显示 **Area 名**;任务属于 Project → 显示 **Project 名**(此时不显示其上层 Area)。**两者不会同时显示。**
    **Sources:** [Question about Today/Upcoming/Anytime views when using Areas+Projects together – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/g076ph/question_about_todayupcoming_anytime_views_when/)("If you have a To-do inside of an Area, it will show the Area name… Once it is a Project inside of that same Area, it shows the Project name instead of the Area name");**官方截图** `today.jpg`(`Finish expense report` 属 Work Area → 显示 `Work`;`Review milestones` 属 Prepare Presentation Project → 显示 `Prepare Presentation`,不显示其 Area);`upcoming.jpg`(`Plan weekend hiking trip` → `Family` Area;`Practice Italian` → `Learn Basic Italian` Project)。
    **Support:** 用户实测 + 官方截图互证。**Confidence:** high。

13. **Claim:** 项目内任务行**不显示其所属 Area**——即不存在「Area > Project」双层路径;Area 只在「任务直接挂 Area」时作为唯一父级出现。
    **Sources:** 同 Finding 12(r/thingsapp g076ph:"Now it shows the Project name **instead of** the Area name");[I wish project names in the Today view would be shown under the Area name – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/rqemc8/)(用户**期望** Area 也显示、抱怨"those project titles sitting arealess, while you do see the area title when there is a projectless task"——反向证明当前项目任务不显示 Area)。
    **Support:** 用户实测(两条一致,含一条明确的功能抱怨)。**Confidence:** high。
    > 与 Finding 1(不显示 Heading)同一设计原则:行上只承载**一个直接父级**的名字,既不向上(Area)也不向下(Heading)扩展层级路径。

14. **Claim:** 当列表**按父级分组**时(Anytime/Someday 默认;Today 开启分组后),归属信息上移到**分组标题**,任务行上不再重复显示归属小字。
    **Sources:** **官方截图** `anytime.jpg`(任务按 `Family` / `Vacation in Rome` / `Throw Party for Eve` 分组,组标题带 Area 盒子图标或项目进度圆环,组内任务行标题下方无归属小字);[An In-Depth Look… – Things Support](https://culturedcode.com/things/support/articles/4001304/)(Anytime"to-dos are grouped under their direct parent list");[Things 3.5 – Things Blog](https://culturedcode.com/things/blog/2018/04/things-3-5/)(Today 可按 project/area 分组)。
    **Support:** 官方截图 + 官方文档互证。**Confidence:** high。
    > 此条与 `.scratch/things3-when-display/research.md` 既有结论(Anytime/Someday 分组后行上不重复显示归属)一致,此处补充 Today 分组模式同理。核心规律:**归属要么在分组标题、要么在行内小字,二者互斥,绝不重复。**

## Contradictions

- **行上归属的精确呈现形式(换行小字 vs 行内副标题)**:`.scratch/things3-when-display` 的截图实证(Today/Upcoming)显示归属是「标题**下方**一行灰色小字」(独立次行);而 Logbook 的官方 bug 记录(3.17.3 "between completion date and title"、3.13.10 "subtitle")指向 Logbook 是更紧凑的**行内**副标题。两者不必然矛盾(不同视图可行布局不同),但官方无统一成文规范,Logbook 是否也是「标题下方换行」未直接证实。**记录存疑**,建议实机对比 Logbook 与 Today 的行结构。
- **无归属任务是否渲染空白占位行**:行为结果(看不到归属文字)高置信,但「整个次行不渲染」vs「渲染空行」的实现差异无证据,标为推测成分。不构成实际矛盾。

## Missing evidence

- **点击行内父级名是否可跳转**(Finding 11):未找到任何官方或实测证据,倾向「不可点击」但置信 low。需实机验证。
- **iPhone 紧凑布局下「标题下方灰色小字」的精确像素呈现**(Finding 7):官方支持截图均为 macOS;基于「行解剖跨平台一致」推断行为一致(medium-high),但无 iPhone 官方截图直接佐证小字行的字号/截断行为。
- **Logbook 归属副标题的精确视觉**(Finding 4):官方仅由 bug 记录证明「存在 subtitle + 行内完成日期紧贴标题」,是否换行在标题下方、是否与完成日期同行,无直接截图描述。
- **官方对「行上归属只显示直接父级一层」无成文规则**:该结论由官方截图 + 用户实测归纳,官方文档未明确写出「不显示 Heading / 不显示 Area」的条款(仅通过定位 Heading 为项目内视觉结构、与社区一致抱怨间接确证)。

## Sources

- Kept: [An In-Depth Look at Today, Upcoming, Anytime, and Someday – Things Support](https://culturedcode.com/things/support/articles/4001304/) — Anytime 排序(loose 任务浮顶/按直接父级分组)、分组设置跨设备同步、Inbox 无归属语义的一手来源
- Kept: [Using Headings in Projects – Things Support](https://culturedcode.com/things/support/articles/2803577/) — Heading 仅限项目、是项目内视觉分组(支撑「行上不显示 Heading」的定位解释)
- Kept: [Task Heading in Today View – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/aszdob/task_heading_in_today_view/) 与 [I'd love to see under which heading… – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/1c51uau/) — 行上只显示 Project、不显示 Heading 的实测(两独立线程一致)
- Kept: [Question about Today/Upcoming/Anytime… Areas+Projects – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/g076ph/) — Area 归属 vs Project 归属互斥、只显示直接父级一层的实测
- Kept: [I wish project names… under the Area name – r/thingsapp](https://www.reddit.com/r/thingsapp/comments/rqemc8/) — 反向佐证项目任务不显示 Area
- Kept: [iPad Release Notes – Things Support](https://culturedcode.com/things/support/articles/2409117/) — Logbook 行内 subtitle(3.13.10)、完成日期紧贴标题(3.17.3)、父子归档(3.13.9)、行组件统一(3.23)
- Kept: [Things 3.5 – Things Blog](https://culturedcode.com/things/blog/2018/04/things-3-5/) — Today 分组按 project/area、iOS 与 Mac 一致
- Kept: [The Sweet Setup: Capturing Tasks for iPad and iPhone](https://thesweetsetup.com/a-guide-to-capturing-tasks-in-things-3-for-ipad-and-iphone/) — iOS 与 Mac 任务解剖一致
- Kept: [MacStories: Things 3 review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/) — task-as-object 点击展开卡片交互
- Kept: 官方截图 `.scratch/things3-when-display/images/today.jpg` / `upcoming.jpg` / `anytime.jpg` — 归属小字行(Today/Upcoming)、分组后行上无归属(Anytime)、无归属任务无小字行 的视觉实证
- Rejected/deprioritized: things3-cloud / things3-core (docs.rs) — 第三方 Rust 重实现,仅佐证数据模型(project_uuid/area_uuid 单父级),不作为 UI 证据;blakecrosley 设计分析 — 作者自绘 token/行结构示意,非官方规范;多则 Reddit 使用习惯帖 — 仅背景

## 对自研任务应用的参考要点

1. **行上只显示「直接父级一层」是 Things 的核心克制**:不向上带 Area、不向下带 Heading,避免层级路径刷屏。自研若有多层容器(org > space > project > section),需明确选择「行上显示哪一层」——Things 选了**最近的有语义容器**(Project 优先,无 Project 才 Area),并牺牲了 Heading/section 可见性。
2. **归属「分组标题 vs 行内小字」互斥不重复**:列表已按父级分组时,行上坚决不再重复归属——保持行干净。自研应让归属在「分组语境」与「行内标签」间二选一。
3. **Heading/section 不可见的代价是同名任务歧义**(Finding 3 的真实抱怨):自研若支持项目内子分组,平铺视图可考虑显示最近一层子分组,或提供「显示完整路径」开关,规避 Things 的已知痛点。
4. **无归属是独立状态而非缺失**:无父级任务浮顶/不渲染归属行,把「未归类」做成可识别、可操作的信号(GTD 的 process inbox)。
5. **归属标签只读、导航走专门入口**(Quick Find/侧边栏):行内父级名不做成可点链接,避免行内出现两种点击目标(展开 vs 跳转)的歧义。自研若要让父级名可点,需与「点击行展开详情」做清晰的命中区分离。

## Next steps

- 实机(Mac 15 天试用)验证三处未决:① 点击行内父级名是否可跳转;② iPhone 紧凑布局小字行的截断/字号;③ Logbook 副标题是换行还是行内。
- 若需 Area/Project 归属差异的更多官方截图,抓取官方支持文章 `dates-today.jpg` / `dates-anytime.jpg` 原图逐一标注(本目录已存 today/anytime/upcoming 三图可直接复用)。
