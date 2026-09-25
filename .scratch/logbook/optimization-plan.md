# Logbook 界面优化方案

> 依据：`.scratch/logbook/things3-logbook-research.md`（Things 3 调研，22 条带来源发现）。
> 现状代码：`packages/ui/src/pages/Logbook.tsx`、`packages/ui/src/components/feed/`、
> `packages/ui/src/components/task/TaskItem.tsx`、`packages/backend/src/feed/feed.service.ts`。

## 现状诊断

已有基础（与 Things 同构，无需重做）：

- 三态模型（open / completed / cancelled）已落地（ADR 0006），勾选框 ✓/X 双态、
  删除线 + 弱化、完成退出动画（350ms）均存在于 `TaskItem` / `TaskCheckbox`。
- 后端 logbook feed 已按 `settledAt desc` 排序，任务 + 项目混合返回。
- 项目行已有 `ProjectProgressRing` 圆环图标。

差距（按用户价值排序）：

| # | 差距 | Things 参照 |
|---|------|------------|
| 1 | 「今天/昨天/更早」三段式，「更早」是无底洞 | 逐日分组、倒序无限滚动 |
| 2 | 行上不显示了结日期，分组粗导致无法定位「那天干了什么」 | 行内完成日期紧贴标题，远期完整格式（3.5 官方修正） |
| 3 | 完成/取消的项目行：无 cancelled 处理、无撤销入口、无了却日期 | 项目是一等条目（进度圆环 + 日期），取消可逆 |
| 4 | 项目行在 Logbook 无「归档后子任务不重复罗列」之外的差异化处理 | 与任务同级但图标区分 |
| 5 | 全量加载，长年使用后性能隐患 | 官方也曾专门优化 Logbook 长列表（iPad 3.17.9） |
| 6 | 空状态仅一行文字 | 官方确认空 Logbook 有温度文案（非空白页） |

## 方案（按迭代排序）

### P0-1 渐进粒度分组（近期逐日，远期收拢）

**改动范围**：仅 `Logbook.tsx`（纯前端重组），后端不动。

按 `completedAt`（settledAt）分组、倒序；组内保持 `settledAt desc`。
分组粒度随距离衰减（对齐 Things Upcoming「近处精细、远处粗粒度」的哲学，
也避免纯逐日分组导致的分组标题无限增生）：

| 区间 | 粒度 | 标题示例 |
|------|------|----------|
| 当天 | 日 | `common:today` |
| 昨天 | 日 | `task:yesterday`（已有 key） |
| 3~7 天前 | 逐日 | 星期全称（「星期三」/ "Wednesday"） |
| 本月更早 | 周 | 「3月3日 – 3月9日」（周一起始，locale 感知） |
| 当年更早 | 月 | 「2月」/ "February" |
| 跨年 | 年 | 「2024」 |

- 标题格式用 `Intl.DateTimeFormat` 实现 locale 感知。
- 新增纯函数 `groupLogbookItems(items, now)`（放 `packages/api/src/utils/` 或
  Logbook 同目录），返回 `{ key, label, items }[]`，粒度规则集中在这一处，
  便于将来调整（如实测 Things 后想改回纯逐日）。
- 分组标题样式微调：组间加一条细分隔线（`border-border/40`），视觉上替代现在
  仅靠留白分段的方式。

### P0-2 行内了却日期

**改动范围**：`FeedItemRow` + 新小组件，不动 `TaskItem` 主体（避免影响其他视图）。

- 新增 `SettledDateBadge`：显示 `formatShortDate(completedAt)` 短绝对日期，
  **所有分组一律只显示日期、不显示时刻**（用户决策：不要 HH:mm；取消条目也
  不加 X 图标，勾选框的 X 已足够表达）。跨年时带上年份。
- 注入位置：`FeedItemRow` 在 Logbook 场景下于标题区之后、tag 之前渲染，
  样式 `text-xs text-muted-foreground`（与现有项目/领域 tag 同层级）。
- 关键决策：**不改 `TaskItem` 加 prop 蔓延**。`FeedItemRow` 已是 Logbook 专用包装层，
  日期徽标作为该层的职责；若未来项目内 logged 区也需要，再下沉。

### P0-3 项目行的终态一致性（已收窄）

**改动范围**：`ProjectFeedRow` + `ProjectProgressRing`。

- `ProjectProgressRing` 增加 cancelled 态：X 替换 ✓、色调弱化（与 `TaskCheckbox`
  cancelled 态同构）。
- `ProjectFeedRow` 标题样式：`completed || cancelled || trashed` 均删除线 + 弱化
  （补上原本漏掉的 cancelled）。

**范围收窄说明**：原计划补齐项目取消能力（`cancel`/`uncancel` endpoint + hook）。
但 ADR 0006 明确「cancelling a project is out of scope」——Projects 有意保持
ACTIVE/COMPLETED 二值状态；且 Prisma `ProjectStatus` 枚举本身无 CANCELLED。
故项目取消能力**不在本次范围**，仅作防御性呈现（X 图标 + 删除线），
与领域模型保持一致、避免越界。若未来要为项目引入取消，需先立 ADR 修订 0006。

### P1-1 增量渲染（轻量分页）

**原则**：先不改后端契约。Logbook 数据量到几千条前，全量返回 + 前端分批渲染足够。

- `Logbook.tsx` 内做「渲染窗口」：初始渲染最近 ~30 天分组，滚动近底部
  （IntersectionObserver 哨兵）每次追加一段。窗口以**分组**为单位追加而非固定天数，
  避免远期稀疏区间一次加载过多标题。
- 数据仍全量取回；仅控制 DOM 规模。这是 Things「无限滚动浏览历史」体验的最小实现。
- 若实测数据量成为瓶颈（如 >5k 条 settled 记录），再引入后端 cursor 分页
  （`settledAt` + id 双键游标），届时 feed API 加 `?cursor=&limit=` 参数。

### P1-2 空状态与收尾

- 空状态文案改为有温度的引导（对齐 Things 空 Logbook 有文案的确认），
  如「完成的任务会在这里留下足迹」+ 居中排版，可配浅色插图/图标。
- 分组进入动画：新了结任务出现在「今天」组顶部时做一次淡入（复用现有
  `checkbox-pop` / `task-complete-anim` 的动画 token，不新增动画体系）。

### P2（候选，先不做）

- 「Logged Projects」筛选：Logbook 顶部加 任务/项目 筛选段（对齐 Things 隐藏列表
  「过去成就总览」，适合复盘场景）。等 P0 落地后看使用反馈再定。
- 完成归档时机设置（立即/手动）：Things 的受欢迎行为，但涉及设置体系与
  Today 视图行为变更，独立提案。

## 明确不做

- **可折叠分组 / 密度切换**：调研确认 Things 无此能力（Finding 11）。
- **行内标签(tags)展示调整**：Things 行上是否显示 tags 未找到一手来源，维持现状
  （色点）不动。
- **撤销完成的确认弹窗**：仅单源二手提及，且与 Taskora 键盘流哲学冲突，不加。

## 验证点

- 单元测试：`groupLogbookItems` 各粒度区间（当天/昨天/7天内逐日/本月按周/
  当年按月/跨年按年）与边界（跨月周、年初年末）；分组函数对空 `completedAt`
  条目的处理（跳过 + 告警，与现状一致）。
- 组件测试：Logbook 渲染多分组结构；项目行 cancelled 态显示 X + 删除线。
- 手动：制造跨月/跨年 settled 数据检查分组标题；快速滚动检查渲染窗口追加。
