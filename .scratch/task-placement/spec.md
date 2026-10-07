# 展开任务的归属入口

Status: implemented — automated checks passed; awaiting user acceptance

## 需求

在展开任务卡片**外侧的右下方**显示直接所属的 Project / Area，参考 Things 的低调文字入口；不是卡片内部底栏的一部分。点击后可选择：

- **前往项目 / 前往区域**：打开直接所属 Project / Area 的现有页面。
- **更改项目 / 更改区域**：打开现有 MovePicker，沿用搜索、当前位置标记、键盘操作与移动规则；中英文文案均不带省略号。

## 边界与交互

- 有 Project 时显示 Project；否则显示直接所属 Area。不额外展示 Project 的 Area 或 Project Heading。
- 无 Project / Area 时不显示入口，Bucket 不当作归属。
- 使用实时任务与父级数据；当前已处于直接所属的 Project / Area 页面时隐藏右下角入口（含查询参数、尾斜杠），其余页面仍显示。
- Project 内的 Task 在该 Project 的 Area 页面中仍显示 Project 入口；按直接归属与完整 ID 匹配，不按祖先归属或 ID 前缀匹配。
- 按 Project / Area 分组的视图也隐藏右下角入口（含该视图的新到区），不留空白占位；关闭分组后恢复。显隐由实际渲染视图传递，不因全局分组偏好误隐藏其他非分组页面。
- 沿用既有字体、颜色与图标：ProjectProgressPie / Layers，长名称截断，完整名称提供在提示与无障碍名称中。
- 归属在卡片背景与阴影之外单独一行右对齐，无常驻按钮底色；内部底栏保持原布局。窄屏同样外置，长名称截断。
- 展开时不重复显示原有标题下的归属小字；收起后外侧入口随详情动画移除，恢复折叠行小字。
- 桌面沿用右对齐的紧凑 Popover，窄屏沿用 FieldPickerDialog；更改进入 MovePicker 后桌面聚焦搜索，触屏不自动弹键盘。
- 点击、关闭或 Escape 不误触任务展开/收起；选择目标后关闭，写入沿用 useUpdateTask，失败沿用保存失败提示。
- 补齐中英文文案；不修改数据模型、导航路由或移动规则。

## 验证

覆盖 Project / Area 展示与前往、无归属、父级改名与任务移动后的刷新、长名称、移动 DTO、Escape、键盘和窄屏选择器。

- `pnpm --filter @taskora/ui test`：68 个测试文件、701 个测试通过（含归属入口 26 个用例、分组视图显隐传递 4 个用例）。
- `pnpm --filter @taskora/ui typecheck`：通过；改动的 TS/TSX 文件 ESLint 通过。
- Chromium 隔离样例视觉检查：实际组件 + 现有 CSS + 内存查询数据，未写入账号数据；覆盖桌面、375px 手机宽度、动作菜单、移动卡片和长名称，页面无 JS 错误、无横向溢出，并验证归属按钮位于卡片 DOM 外、纵坐标在卡片底边之下。此检查不代替真实账号端到端验收。
