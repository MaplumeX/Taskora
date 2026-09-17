# 全局 keymap registry + Selection context

为对齐 Things3 键盘体验，键盘输入采用「单点分发」架构：`packages/ui` 内一个 window 级 keydown 监听（keymap registry）统一解析键位并派发动作，选中状态提升为跨页面的 Selection context，动作复用现有 hooks（如 `useContentBottomActionsForRoute`），不引入新依赖。未来多选、自定义键位、侧边栏导航都在此扩展。

## Considered Options

- 各组件各自监听 keydown（被否：顺序不可控、编辑态/选中态判断分散，容易双触发）
- 引入 react-hotkeys-hook 等库（被否：需求简单，单文件可覆盖）

## Consequences

- **⌘K/Ctrl+K 从「搜索」改为「完成选中任务」**（对齐 Things），搜索三端统一为 ⌘F/Ctrl+F。这是 Web 端的破坏性变更：现有用户 Ctrl+K 打开搜索的习惯会被打破，属有意为之，勿"修复"。
- **Web 端键位系统性降级为 Alt 系**（Alt+1-6 导航、Alt+N 新任务等）：Chrome/Edge 无法拦截 Ctrl+N/T/W/数字等浏览器保留键，降级键位是硬编码的，不做用户配置。
- 桌面端（Tauri，macOS/Windows）保持 Things 原键位；Windows 修饰键 ⌘→Ctrl 自适应。
- 无承载的键位（⌥⌘K 取消、⌘E This Evening、⇧⌘R 重复、⌘D 复制）暂不实现，待域模型扩展（CANCELLED 状态、evening、重复规则）与 duplicate API 落地后再补，键位表见 `docs/keyboard-shortcuts.md`。
