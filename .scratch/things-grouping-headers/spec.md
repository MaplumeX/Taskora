# Things 风格的 Group Header

## 需求与依据

用户希望 Grouped View 按 Project / Area 分组时，父级呈现为任务上方的标题，而不是普通项目条目。

上一版误把标题做成了蓝色纯文字链接，删除了进度环和图标。用户明确纠正：**保留进度环、图标；标题默认黑色，hover 才变蓝并在右侧出现 `>`；无文字下划线，右键菜单正常工作。** 本规格以这次纠正为准。

已实际查看以下 Things 官方图片：

- [Anytime 截图](https://culturedcode.com/frozen/2025/10/dates-anytime.jpg)：Project 进度环、Area 图标、黑色加粗标题，以及各组标题下的淡色分隔线。
- [Someday 截图](https://culturedcode.com/frozen/2025/10/dates-someday.jpg)：Area 图标、黑色加粗标题、淡色分隔线。
- [官方视图说明](https://culturedcode.com/things/support/articles/4001304/)：任务按直接父级分组。
- [官方 Mac 更新说明](https://culturedcode.com/things/support/articles/1100684/)：Area 分组标题右键可使用 Tags。

静态截图不能证明 hover 行为；hover 的蓝色与 `>` 交互以用户明确描述为准。**分隔线不是文字下划线**，按参考图保留分隔线，删除文字链接下划线。

## 设计与交互

- Project：保留进度环，复用原有完成操作及剩余任务确认对话框。标题行右侧常驻显示原有 Deadline 旗帜与倒计时；未到期灰色，到期／逾期红色。不并入标题链接，不受标题 hover 变蓝影响。无 Deadline 时不显示。
- Area：保留图标，图标槽位与 Project 对齐。
- 标题沿用 `text-body` 正文字阶与半粗体，默认前景色（浅色主题为黑色，深色主题适配），不是常驻蓝色。
- hover 标题：文字变蓝，文字右侧出现 `>`；无文字下划线，无整行卡片式 hover 背景。键盘焦点也提供蓝色和箭头提示。
- 保留淡色分隔线与组间 24px 留白。长标题截断，箭头预留空间，不在 hover 时推动文字。
- 标题使用 heading + 导航链接。Project 进度环与链接是两个独立控件，点击进度环不导航。
- Project 保留原有右键菜单；Area 增加复用详情页操作的右键入口（Tags / Delete）。从分组视图删除 Area 不强制跳转到 Today，详情页原有删除导航不变。
- 键盘 ↑/↓ 移动 Selection 与 DOM 焦点时跳过 Project / Area Group Header；Alt+↑/↓ 在组内跳到首／末任务，不停在组头。完成、取消、删除后的自动选邻居也跳过组头。独立 Project 行和项目内部 Project Heading 不受影响。
- 组头仍登记父级上下文，保留显式聚焦标题后的 Enter 导航与 Space「下方新建」；保留组头拖拽投放面、组内重排、跨组改归属与新任务预填上下文。
- 不修改独立项目行、项目内部 Project Heading、平铺视图或底层数据。

## 验收

- Today / Anytime / Someday：图标、进度环、黑色标题与 hover 蓝色箭头符合以上要求。
- 默认和 hover 均无文字下划线、无整行 hover 背景；淡色分隔线保留。
- 实际 Project / Area 右键菜单可打开并执行操作；进度环可完成项目。
- Project 截止徽标正常显示，覆盖未到期、今天到期、逾期和无截止日期；长标题不能挤掉右侧徽标。
- 导航、键盘、拖拽、独立项目行、关闭分组回归通过。
- 桌面、手机、深色与长标题的组件视觉检查通过。

## 验证记录

- 最新 UI 全量测试：69 个文件、723 项通过；包含截止徽标、上下键跳过组头的 Selection / DOM focus、Alt+↑ 组内首任务、动作后自动选邻居，以及真实 Project / Area 右键菜单回归。
- UI 类型检查、修改文件 ESLint、`git diff --check` 与 Web 生产构建通过。
- Chromium 中挂载真实 `ProjectGroupHeaderRow` / `AreaGroupHeaderRow`（含真实菜单，未模拟组件），检查 1024px / 390px / 深色 320px：默认中性前景色、箭头隐藏；hover 蓝色、箭头可见、无文字下划线、无整行背景、无布局跳动；长标题截断且无横向溢出。
- 在该隔离组件页面实际右键打开 Project 与 Area 菜单并截图。不是登录后完整应用的端到端验证，菜单写入通过集成测试的 mutation 断言验证。
- 截止徽标补充验证：108 项相关回归通过（含未到期／今天／逾期／无日期），类型检查、ESLint 与 Web 构建通过；Chromium 验证标题 hover 不改变截止颜色，320px 长标题不与徽标重叠。
- 截图位于 `/tmp/taskora-header-corrected-desktop-hover.png`、`/tmp/taskora-header-corrected-project-menu.png`、`/tmp/taskora-header-corrected-area-menu.png`、`/tmp/taskora-header-corrected-mobile-dark.png`。
