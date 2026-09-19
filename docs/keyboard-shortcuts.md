# 键盘快捷键（Things3 对齐方案）

对齐目标：[Things 官方快捷键](https://culturedcode.com/things/support/articles/2785159/)。
架构决策见 [ADR-0004](../adr/0004-keymap-registry-and-selection-context.md)。

- 桌面端（Tauri）：macOS 用 ⌘，Windows 用 Ctrl，保持 Things 原键位。
- Web 端：浏览器保留键（Ctrl+N/T/W/数字）无法拦截，降级为 Alt 系。
- 键位硬编码，不做用户配置。
- 支持 macOS 与 Windows。

## P0（选择模型 + 导航 + 创建 + 完成/删除）

### 导航

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 去 Inbox / Today / Upcoming / Anytime / Someday / Logbook | ⌘1 … ⌘6 | Ctrl+1 … Ctrl+6 | Alt+1 … Alt+6 |
| 返回上一列表 | ⌘← | Alt+← | Alt+←（浏览器返回同效） |

### 选择（Selection）

| 动作 | 全平台 |
|---|---|
| 上移 / 下移选中 | ↑ / ↓ |
| 选中首项 / 末项 | Alt+↑ / Alt+↓ |
| 全选（批量完成/删除） | ⌘A / Ctrl+A |

覆盖范围：8 个 Bucket 页（Inbox/Today/Upcoming/Anytime/Someday/Logbook/Trash/Calendar）+ Project/Area/Tag 详情页。遍历时 Heading 行可被选中跳过。

### 创建

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 新任务 | ⌘N | Ctrl+N | Alt+N |
| 选中项下方新建 | Space | Space | Space |
| 新项目 | ⌥⌘N | Ctrl+Alt+N | Alt+Shift+N |
| 新 Heading | ⇧⌘N | Ctrl+Shift+N | Alt+H |

### 完成 / 删除 / 取消

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 完成选中 | ⌘K | Ctrl+K | Ctrl+K（⚠️ Web 端原为搜索，已改） |
| 取消选中（撤销取消） | ⌥⌘K | Ctrl+Alt+K | Alt+Shift+K |
| 删除到 Trash | ⌫ / Delete | ⌫ / Delete | ⌫ / Delete |

取消与完成同型：Logbook 中 ⌘K 撤销了结（已完成的撤销完成，已取消的撤销取消）。

### 打开 / 编辑

| 动作 | 全平台 |
|---|---|
| 展开选中任务（行内） | Enter（再按 Enter 聚焦标题编辑，Esc 收起） |
| 保存并收起 | ⌘Enter / Ctrl+Enter |

### 全局

| 动作 | macOS | Windows | Web |
|---|---|---|---|
| 搜索 | ⌘F | Ctrl+F | Ctrl+F |
| Quick Add（系统级） | ⌘⇧Space | Ctrl+Shift+Space | — |

Quick Add 从 `Cmd/Ctrl+Space` 改为 `Cmd/Ctrl+Shift+Space`：Windows 上 Ctrl+Space 是中文输入法切换键，macOS 上 ⌘Space 是 Spotlight。

## P1（日期 + 侧边栏）

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 显示 When 弹窗 | ⌘S | Ctrl+S | Alt+S |
| 设为 Today | ⌘T | Ctrl+T | Alt+T |
| 设为 Anytime | ⌘R | Ctrl+R | Alt+R |
| 设为 Someday | ⌘O | Ctrl+O | Alt+O |
| 计划日期 ±1 天 | Ctrl+] / Ctrl+[ | 同左 | 同左 |
| 计划日期 ±1 周 | Ctrl+Shift+] / Ctrl+Shift+[ | 同左 | 同左 |
| 添加 Deadline（dueDate） | ⇧⌘D | Ctrl+Shift+D | Alt+Shift+D |
| 侧边栏上/下导航 | ⌃⌥⌘↑ / ↓ | Ctrl+Alt+↑ / ↓ | Alt+↑ / ↓（与选中首末冲突，另定） |

## P2（移动/排序 + 多选 + 标签）

| 动作 | 键位（桌面端） |
|---|---|
| 移到其他列表 | ⇧⌘M |
| 上移 / 下移 | ⌘↑ / ⌘↓ |
| 移到顶 / 底 | ⌥⌘↑ / ⌥⌘↓ |
| 扩展多选 | ⇧↑ / ⇧↓ |
| 编辑标签 | ⇧⌘T |
| ⌘A 全选后的批量移动/设日期 | 复用上表 |

## 暂缓（域模型/API 缺失，功能落地时一并补键）

| 动作 | Things 键位 | 缺失项 |
|---|---|---|
| This Evening | ⌘E | 无 evening 概念 |
| 重复规则 | ⇧⌘R | 无重复模型 |
| 复制任务 | ⌘D | 无 duplicate API |
| Type Travel | 直接打字跳转 | 决定不做；打字预填搜索亦不做 |
