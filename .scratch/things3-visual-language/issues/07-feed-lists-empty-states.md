# 07: 列表结构、分组头与空状态

Status: done
Blocked by: 04

## 内容

`GroupHeaderRowShell` / `ProjectGroupHeaderRow` / `AreaGroupHeaderRow` / `ProjectHeadingRow` / `ProjectFeedRow` / `SettledDateBadge`：`section` 字阶、0.5px 分割线、24px 上留白；Project 行样式；Logbook 弱化；各 Bucket 空状态（48px 灰色图标 + 一行文案）；列表页边距桌面 48px / 手机 16px；`MobileFab` 与 `ContentBottomBar` 样式。

## 验收标准

- [x] Today（分组视图）、Upcoming、Logbook、Project 详情截图符合 spec
- [x] 空 Inbox / 空 Today 显示新空状态

## Comments

- 2026-09-27：完成。Group Header / Project Heading：1px 细线 + 仅上方圆角（原 `rounded-lg` + 2px 下边框在两端弯成弧，看起来像阴影）；Group Header 标题 `body` 600，Project Heading `section` 蓝色；选中 `bg-selection`。Project 行 32px、`body` 600，Tag 胶囊与 Task 行共用新抽出的 `TaskTagCapsules`。空状态统一为 `common/EmptyState`（按路由取 Bucket 图标，48px 灰色线性图标 + 一行灰字），替换 FeedEmptyHint / TaskList / ProjectTaskLayout / Logbook / Trash 各自的实现。页面容器 `max-w-3xl` + 桌面 48px 左右边距；底部工具栏去掉上边框；Upcoming 空日期最小高度缩为一行。MobileFab 保持 56px（未改为 48px）。
