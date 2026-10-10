# 04 项目页拖到左边缘新建 Heading

Status: implemented — awaiting device acceptance
Blocked by: 02

## Problem

01 去掉项目页菜单后，手机上需要新的 Heading 入口。

## Design

见 spec「项目页：左边缘新建 Heading」。

- 拖动中手指 x 进入左边缘区（约 24px）时，占位从任务行切换为 Heading 行。
- 松手：新建 Heading，并以一次 `ReorderProjectHeadingLayoutDto` 写回布局——Heading 位于落点，落点之后的同组任务移到新 Heading 下；进入 Heading 标题编辑。

## Acceptance

- 无 Heading 的项目，在第 2、3 个任务之间左边缘松手 → 第 3 个起的任务归入新 Heading。
- 在某 Heading 组内松手 → 原组被切开，后半段归入新 Heading。
- 离开左边缘区时占位切回任务行。

## Comments

### 2026-10-10 — 实现

- 左边缘区宽 24px（`MAGIC_PLUS_HEADING_EDGE`），按指针 x = 起拖点 clientX + delta.x 判定。
- 落点始终在「草稿任务」布局上算（`taskModeLayoutRef`）；左边缘模式下渲染的是 `splitAtTask` 在草稿处切开后的布局，草稿任务换成草稿 Heading（`MAGIC_PLUS_HEADING_ID`，占位行 + 一条主色横线）。
- `splitAtTask`：去掉草稿，所在组从草稿处切开，后半段归入紧跟该组的新 Heading（在无 Heading 部分时成为第一个 Heading）。
- 松手：`createProjectHeading`；新 Heading 出现在 props 后把草稿 id 换成它，整份写回布局，进入标题编辑、Selection 移到它。期间暂存服务端布局。失败时恢复布局并提示。
- 01 可以发布了（项目页又有了新建 Heading 的入口）。
- 测试：`splitAtTask`（无 Heading 部分 / 某 Heading 内 / 未知任务）、左边缘预览与切开写回、离开左边缘切回任务、新建失败恢复。
