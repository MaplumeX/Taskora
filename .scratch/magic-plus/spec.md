# Magic Plus（触屏可拖放的添加按钮）

Status: implemented — awaiting device acceptance

把手机端右下角的 `MobileFab` 从「只能点」升级为对齐 Things 3 iPhone 的 Magic Plus：点按新建，按住拖动可把新条目放到列表任意位置、拖进左下角 Inbox 目标、在项目里拖到屏幕左边缘新建 Heading、在 Upcoming 拖到某一天、在首页拖进某个区域新建项目。术语见根 `CONTEXT.md`（Magic Plus）。

## Problem Statement

- 项目页点 FAB 先弹菜单「添加任务 / 添加标题」，最常用的加任务要点两下。
- 新任务只能落在列表末尾，想放到中间得先建、再长按拖过去。
- Upcoming 不显示 FAB，没法在手机上直接给某一天加任务。
- 想记一条与当前列表无关的任务，得先返回首页、进 Inbox。
- 首页不能直接在某个区域里新建项目（只能新建顶层项目，再移动）。

## Solution

### 点按

| 页面 | 点按 |
|---|---|
| 首页 | 不变：朝上菜单「任务（落 Inbox）/ 项目 / 区域」 |
| 项目页 | **直接新建任务**（去掉菜单）；Heading 改由拖到左边缘新建 |
| 区域页 | 不变：菜单「任务 / 项目」 |
| Upcoming | **显示 FAB**；点按新建计划日期为账号时区明天的任务，落在「明天」一节末尾 |
| 其余可加任务的列表 | 不变 |
| Calendar / Logbook / Trash / Agent | 不变：不显示 |

点按新建的任务仍**追加到末尾**（保留 29f0d45 的决定，不改为 Things 的顶部）。

### 拖动

- **手势**：在 FAB 上按下并移动越过 8px 即开始拖动（不需要长按：FAB 不在滚动容器里，没有和滚动抢手势的问题）；没越过就松手 = 点按。拖动中 FAB 原位留一个淡出的空位，手指下跟一个圆形浮层。
- **统一语义**：把 Magic Plus 放到列表的某个落点，等于「一条新建的空任务被拖到这个落点」——字段变化与现有行拖拽完全一致，不另立规则：
  - 放在某两行之间 → 插在该处（写 Position，同 ⌘V 粘贴的「新建后 reorder」路径）；
  - 分组视图（Today / Anytime 等按项目分组）跨组 → 新任务获得该组的归属；
  - 项目内放在某个 Heading 下 → 新任务进该 Heading；
  - Upcoming 放在某一天的分组或组头上 → 计划日期为那天。
  新建后照常展开并进入标题编辑（与点按一致）。
- **实时占位**：拖动中列表在落点处撑开一行空位（同现有行拖拽的实时预览），不支持拖动排序的列表（Deadlines / Repeating / Logbook 等，及页面上的非列表区域）不出现空位，在那里松手 = 取消。
- **自动滚动**：贴近列表上下边缘时滚动，参数同现有触屏拖拽。
- **Inbox 目标**：除 Inbox 页与首页外，开始拖动后左下角浮现 Inbox 目标；在其上松手 → 弹出 `QuickAddCard`（归属 Inbox），不离开当前页（新任务在当前列表里看不见，就地写卡片）。
- **项目页：左边缘新建 Heading**：手指移到屏幕左边缘区（约 24px）时，落点预览从「任务空位」切换为「Heading 空位」；松手在该处新建 Heading 并进入标题编辑。落点之后、同组内的任务移到新 Heading 下（视觉上 Heading 把列表切开，与 Things 一致）。
- **首页：拖进区域新建项目**：放在某个区域（区域行或其项目之间）→ 在该区域里新建项目，位于落点；放在无区域项目段 → 顶层项目。随后同菜单新建项目一样进入项目页编辑标题。首页的其他区域（Inbox / Today 等入口）不是落点。

### 不变

- 多选模式中不显示 FAB；有任务展开时 FAB 缩小淡出（现状）。
- 桌面 `ContentBottomBar` 不受影响。

## Implementation Decisions

- **拖拽源接入全局 DndContext**（ADR 0018）：Magic Plus 是一个特殊拖拽源（固定 id，如 `magic-plus`），由当前页面的列表 surface 认领（`owns`）。各 surface 增加可选的 Magic Plus 落点处理：给出预览用的占位行、松手时把落点翻译成「新建 DTO + 插入位置」。复用现有 `onDragOver` 的落点计算与跨组/改期规则，不复制一份。
- **FAB 用独立传感器**：FAB 上用 `distance: 8` 激活（无 delay）；列表行仍是 TouchSensor 300ms 长按。
- **何时可拖**：当前页有列表接收 Magic Plus 时（`magicPlusAvailable`）。有菜单的页面（首页）也可拖：菜单改为点击时打开。区域页的任务列表不接收，区域页只能点按。
- **首页**：首页的项目 / 区域列表在独立的拖拽上下文里（与隐藏的桌面侧边栏隔开），首页的按钮由 Home 在该上下文里渲染。
- **建任务 + 定位**：`CreateTaskDto` 没有位置字段。按 ⌘V 粘贴的做法：带上下文（含归属 / 计划日期）新建，成功后 reorder 插到落点。项目内 Heading 落点用 `ReorderProjectHeadingLayoutDto` 写回布局。两次写入都走本地副本，不必等服务端。
- **Heading 拆分**：新建 Heading 后用一次布局 reorder 同时完成「Heading 定位 + 落点之后的同组任务移入」。
- **Upcoming 点按**：上下文为计划日期 = 明天（账号时区，ADR-0013）。
- **Inbox 目标**：只在拖动中渲染；落在目标上即取消列表侧的落点，改为打开 `QuickAddCard`（Inbox 上下文，同 `.scratch/quick-add-android` 的卡片）。
- **测试**：在 jsdom 里模拟 pointer 拖动 FAB（参照 `useSwipeToSelect.test.tsx` / `MultiSelect.test.tsx`），断言落点翻译出的 DTO 与插入位置；落点 → DTO 的翻译尽量做成纯函数单测。

## Out of Scope

- 区域页去掉菜单（Things 区域页点按即新待办；但区域内新建项目在手机上目前只有这个入口，等首页拖进区域上线后再议）。
- Today 的 This Evening（模型里还没有这一节）。
- 拖动中的触感反馈。
- 点按位置改为列表顶部。
- 桌面 / 宽屏的 Magic Plus。

## Further Notes

- 依据：[Using Gestures – Things Support](https://culturedcode.com/things/support/articles/2803582/)、[MacStories 评测](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)、[The Sweet Setup](https://thesweetsetup.com/a-guide-to-capturing-tasks-in-things-3-for-ipad-and-iphone/)。
- 「Upcoming 点按 = 明天」和「Heading 拆分落点之后的任务」是本 spec 的取舍，资料里没有明确说明，验收时在 Things 真机上对照。
