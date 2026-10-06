# 04 UI：Tag Picker 树形、过滤栏多层、Tag 详情页

Status: implemented — awaiting visual acceptance
Blocked by: 02, 03

## Problem

Picker、过滤栏和详情页都还按「Group 小节 + Tag」显示，不能体现多层结构，也不能勾选父 Tag。

## Design

见 spec 第 1、2、3 节。

- `tagPickerOptions.ts`：树序加缩进；搜索时显示扁平结果并带父路径。
- `tagFilter.ts`：`TagFilter` 改为 `{ kind: 'tag'; path: string[] } | { kind: 'untagged' }`；`collectFilterOptions` 按子树是否出现决定显示；点已选中的 Tag 时退回上一层；`filterInOptions` 跟上。
- `TagFilterBar.tsx`：按层数渲染多行。
- `TagDetail.tsx`：页头显示可点击的父路径；过滤栏只列出本 Tag 的子 Tag。
- Grouped View 和各列表页的接入方式不变。

## Acceptance

- 纯函数和组件测试覆盖：三层过滤和退层、子 Tag 从列表中消失后过滤自动失效、Picker 勾选父 Tag。
- 在真实 App（桌面 + Android）里目视验收。

## Comments

### 2026-10-06 — 实现

- 共用 `components/tags/tagTree.ts`（`tagForest`、`flattenTagTree`、`tagAncestors`）。
- Picker：`buildTagPickerRows({ tags, query })`，行带 `depth` 与 `path`；去掉 header 行和 `selectableRows`。
- 过滤：`TagFilter = { kind: 'tag'; path } | { kind: 'untagged' }`；`collectFilterOptions(effective, tags, root)`、`filterLevels`、`toggleFilterTag`；`useTagFilter(items, effectiveOf, root?)`。各列表页接入方式不变。
- Tag 详情页：Project 也按子树命中；页头显示可点击的父路径；过滤栏以当前 Tag 为 root，只列子 Tag。
- 未做：真实 App 里的目视验收。

### 2026-10-06 — 网页版目视检查

- 在网页版（隔离的临时 Postgres + 演示账号）里用无头浏览器过了一遍：过滤栏多层、Tag 详情页的父路径与子 Tag 过滤栏、Tag Picker 的缩进与搜索父路径都符合预期，控制台没有报错。
- 侧边栏的「标签」原来是可折叠小节、平铺列出所有 Tag（spec 漏了这个入口）。按用户要求改为单个入口（和日志、废纸篓一样的一行，进入 Tags 页），不再列出各个 Tag；删掉了只为它服务的 `CollapsibleSection` 与文案 `nav:emptyTags`、`tag:new`。
- 仍待人工验收：桌面端与 Android。
