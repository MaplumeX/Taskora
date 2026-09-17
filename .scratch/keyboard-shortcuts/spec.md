# Keyboard Shortcuts Spec（Things3 对齐 P0）

Status: ready-for-agent

对齐 Things3 键盘体验的 P0 阶段：选择模型 + 导航 + 创建 + 完成/删除 + 搜索改绑。
键位表（P0/P1/P2 全量）见 `docs/keyboard-shortcuts.md`；架构决策见 `docs/adr/0004-keymap-registry-and-selection-context.md`。

## Problem Statement

Taskora 目前的操作几乎完全依赖鼠标：用户在浏览任务列表时，无法用键盘在任务之间移动、批量选中任务、完成或删除任务，也无法用快捷键在 Bucket 之间切换、新建任务/项目/Heading、打开搜索。作为一款对标 Things3 的任务管理器，这种体验差距对效率型用户是致命的——他们被迫在键盘和鼠标之间反复切换。

仅有的两个键盘入口（⌘K 搜索、Ctrl+Space 全局 Quick Add）也存在键位冲突问题：与 Things 的 ⌘K（完成）语义相悖，Ctrl+Space 在 Windows 上与中文输入法冲突。

## Solution

引入 Things 风格的键盘操作体系：

1. **Selection（选中）模型**：内容区（Bucket 页与 Project/Area/Tag 详情页）的 Task / Project / Project Heading 行可被键盘选中（视觉高亮 + aria-selected），键盘动作作用于当前 Selection。
2. **全局 keymap registry**：window 级单点 keydown 监听统一解析键位并派发动作；桌面端（Tauri，macOS/Windows）保持 Things 原键位，Web 端因浏览器保留键限制系统性降级为 Alt 系。
3. **改绑**：⌘K/Ctrl+K 从「搜索」改为「完成选中任务」，搜索统一绑 ⌘F/Ctrl+F；桌面全局 Quick Add 从 `Cmd/Ctrl+Space` 改为 `Cmd/Ctrl+Shift+Space`。

## User Stories

1. As a 效率型用户, I want 用 ↑/↓ 在任务列表中逐行移动 Selection, so that 我可以脱离鼠标浏览任务
2. As a 效率型用户, I want 按 Alt+↑/Alt+↓ 直接跳到列表首项/末项, so that 长列表不必逐行按
3. As a 效率型用户, I want 按 ⌘A/Ctrl+A 全选当前列表的任务, so that 我可以批量完成或清理一批任务
4. As a 效率型用户, I want 选中任务后按 ⌘K/Ctrl+K 完成它, so that 我能用 Things 的肌肉记忆快速勾掉任务
5. As a 效率型用户, I want 选中任务后按 ⌫/Delete 把它移入 Trash, so that 不必精确瞄准行内删除按钮
6. As a 效率型用户, I want 选中任务后按 Enter 在行内展开它, so that 我能就地查看和编辑详情而不丢上下文
7. As a 效率型用户, I want 展开后按 Enter 聚焦标题编辑、按 Esc 收起, so that 浏览-编辑-收起的循环可以纯键盘完成
8. As a 效率型用户, I want 编辑展开的任务时按 ⌘Enter/Ctrl+Enter 保存并收起, so that 编辑结束有一个明确的提交动作
9. As a 效率型用户, I want 按 Space 在选中项下方新建任务并直接开始输入标题, so that 连续录入多条任务时手感与 Things 一致
10. As a 效率型用户, I want 在 macOS 桌面端按 ⌘N 新建任务, so that 与 Things 完全一致
11. As a Windows 桌面用户, I want 按 Ctrl+N 新建任务, so that 修饰键符合 Windows 惯例
12. As a Web 端用户, I want 按 Alt+N 新建任务, so that 浏览器 Ctrl+N 不可用的情况下我仍有新建快捷键
13. As a 项目管理者, I want 在 Project 内按 ⇧⌘N/Ctrl+Shift+N（Web: Alt+H）新建 Project Heading, so that 组织项目结构不必碰鼠标
14. As a 用户, I want 按 ⌥⌘N/Ctrl+Alt+N（Web: Alt+Shift+N）新建项目, so that 建项目也有快捷键
15. As a 效率型用户, I want 在 macOS 桌面端按 ⌘1…⌘6 依次跳到 Inbox/Today/Upcoming/Anytime/Someday/Logbook, so that 视图切换完全复刻 Things
16. As a Windows 桌面用户, I want 按 Ctrl+1…Ctrl+6 完成同样的跳转, so that 我享有与 macOS 用户相同的能力
17. As a Web 端用户, I want 按 Alt+1…Alt+6 跳转 Bucket, so that 浏览器占用 Ctrl+数字的情况下我仍能一键切换视图
18. As a 效率型用户, I want 按 ⌘←/Alt+← 返回上一列表, so that 进入项目详情后能快速回到来源列表
19. As a 效率型用户, I want 按 ⌘F/Ctrl+F 打开搜索, so that 搜索有稳定一致的入口
20. As a 原有 Web 用户, 当我按 Ctrl+K 时任务被完成而非打开搜索, 这是有意为之（对齐 Things）, so that 键位语义与 Things 全球用户习惯一致
21. As a 中文输入用户, 我希望桌面全局 Quick Add 是 ⌘⇧Space/Ctrl+Shift+Space, so that 不会与输入法切换键（Ctrl+Space）或 Spotlight（⌘Space）冲突
22. As a 键盘用户, I want 在行内编辑（输入框、Markdown 编辑器）聚焦时快捷键全部让路, so that 打字不会被误触发的动作打断
23. As a 键盘用户, I want Selection 在 Heading 行上可以停留但 ⌘K/⌫ 等动作对其无效或跳过, so that 遍历列表时 Heading 不会成为死点
24. As a 辅助技术用户, I want 选中行携带 aria-selected, so that 屏幕阅读器能感知当前键盘操作对象
25. As a 键盘用户, I want 页面切换（导航到其他 Bucket）后 Selection 重置, so that 不会残留对已不可见行的选中
26. As a 键盘用户, I want Logbook 中按 ⌘K/Ctrl+K 撤销完成（uncomplete）, so that 误完成可以立即撤销
27. As a 键盘用户, I want Trash 中按 ⌫/Delete 恢复或永久删除遵循该页现有交互约定, so that 键盘与鼠标行为一致
28. As a 键盘用户, I want 任务完成/删除后 Selection 自动移到相邻行, so that 连续操作无需重新定位

## Implementation Decisions

- **架构（ADR-0004）**：`packages/ui` 内实现全局 keymap registry——window 级单点 keydown 监听，解析键位后派发动作；Selection 状态提升为跨页面的 context；动作复用现有 hooks（如内容区底部动作条的 route-aware hooks），不引入新依赖。
- **平台检测**：mac/Windows 桌面保持 Things 原键位（⌘↔Ctrl 自适应）；Web 端降级为 Alt 系（Alt+1-6、Alt+N、Alt+Shift+N 项目、Alt+H Heading）。平台判定依据运行环境（Tauri 与否）。
- **Selection 语义**：Selection 是键盘动作的作用对象（见 CONTEXT.md 词条），区别于 DOM focus；行组件以 aria-selected 暴露。覆盖 8 个 Bucket 页 + Project/Area/Tag 详情页；遍历时可停留在 Project Heading 行。
- **Enter 语义**：行内展开（非详情路由）→ 再按 Enter 聚焦标题 → Esc 收起；⌘Enter 保存收起。Space = 选中项下方新建（checkbox 勾选走 Tab 聚焦的原生 aria 路径）。
- **⌘K 改绑**：完成选中任务；Logbook 中为撤销完成。搜索改绑 ⌘F/Ctrl+F。ContentBottomBar 中现有 Ctrl+K 监听移除。
- **Quick Add 改键**：Tauri 全局快捷键常量改为 `CmdOrCtrl+Shift+Space`。
- **无域模型变更**：取消（⌥⌘K）、This Evening（⌘E）、重复（⇧⌘R）、复制（⌘D）暂缓——等 CANCELLED 状态、evening 概念、重复模型、duplicate API 落地后随功能补键。
- **键位硬编码**，不做配置页。
- **批量操作（P0 范围）**：⌘A 全选后支持批量完成与批量删除（复用单条 mutation 循环或现有批量接口，以现有 API 为准）。
- **返回上一列表**：基于路由历史（react-router）。

## Testing Decisions

- **主接缝（页面/布局组件级，复用现有模式）**：vitest + testing-library 渲染页面组件，mock TanStack Query hooks 与 mutations（先例：`ProjectTaskLayout.test.tsx` 的 harness 模式），向 window 派发真实 KeyboardEvent，断言外部可见行为：aria-selected 移动、mutation 调用、展开态/焦点变化。
- **辅助接缝（纯函数）**：键位解析器（事件 + 平台 → 动作）的单测，覆盖 mac/Win/Web 三平台键位矩阵。理由：三平台矩阵若全穿透 DOM 测试需模拟平台环境，成本过高；页面层只测动作派发。
- 好的测试只断言外部行为（选中态、mutation 调用、DOM 可见变化），不断言内部状态结构。
- Tauri 全局快捷键改键不设测试（常量改动，构建即验证）。

## Out of Scope

- P1（日期全套 ⌘S/T/R/O、Ctrl+[/] 增减、Deadline、侧边栏键盘导航）
- P2（移动/排序 ⌘↑↓、⇧↑↓ 扩展多选的完整批量体系、标签 ⇧⌘T）
- 取消任务、This Evening、重复规则、复制任务（域模型/API 缺失，随功能实现补键）
- Type Travel（决定不做，连打字预填搜索也不做）
- 快捷键自定义/设置页
- 移动端（MobileFab/MobileTabBar/MobileNavDrawer）不受影响
- Markdown 编辑器内新增样式快捷键（tiptap 已有）

## Further Notes

- 键位完整对照表（含 P1/P2 与暂缓项及原因）维护在 `docs/keyboard-shortcuts.md`，实现与用户帮助文案均以此为准。
- Web 端 Ctrl+K 语义变更（搜索 → 完成任务）是破坏性变更，已在 ADR-0004 记录为有意为之。
