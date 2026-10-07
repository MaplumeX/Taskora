# 键盘快捷键（Things3 对齐方案）

对齐目标：[Things 官方快捷键](https://culturedcode.com/things/support/articles/2785159/)。
架构决策见 [ADR-0004](../adr/0004-keymap-registry-and-selection-context.md)。

- 桌面端（Tauri）：macOS 用 ⌘，Windows 用 Ctrl，保持 Things 原键位。
- Web 端：浏览器保留键（Ctrl+N/T/W/数字）无法拦截，降级为 Alt 系。
- 以下为默认键位；用户可在「设置 → 快捷键」中改绑（仅存本机，不跨设备同步），见 [ADR-0017](./adr/0017-user-customizable-keybindings.md)。系统级 Quick Add 与 Quick Add 卡片内键位同样可改（仅桌面端显示）；⌘Enter 保存、卡片内的 Enter / Esc 与打字唤起不可改绑。
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
| 扩展 / 收缩多选 | ⇧↑ / ⇧↓ |
| 全选（批量完成/删除） | ⌘A / Ctrl+A |

鼠标多选：⌘+点击（macOS）/ Ctrl+点击（Windows、Linux）切换单行，⇧+点击选中锚点（上次单选或 ⌘/Ctrl+点击的行）到该行的连续范围。多选只含任务行，⇧↑/↓ 跳过 Heading、项目、组头。完成、取消、删除、打标等键位作用于全部选中行。

多项拖拽：拖动多选中的一行时其余选中行收起，被拖条目始终贴着手，浮层显示件数；松手后整组按原显示顺序落在落点，随之改归属（分组视图）、Heading（项目页）或计划日期（Upcoming），多选保留。拖动未选中的行仍只拖它自己。

覆盖范围：8 个 Bucket 页（Inbox/Today/Upcoming/Anytime/Someday/Logbook/Trash/Calendar）+ Project/Area/Tag 详情页。遍历时 Heading 行可被选中跳过。

Grouped View（今天/随时/将来按项目/区域分组）补充规则：

- Alt+↑/↓ 在组边界处钳制（组内首/末行，组块首行即组头），任务不会经键盘离开所在组。
- Group Header 上 Enter 打开项目/区域详情（与项目行一致），Space（下方新建）在该父级内创建任务。分组不可折叠（组头是下横线小节标题，无折叠按钮与对应键位）。

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

### 标签

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 对选中项打开 Tag Picker | ⇧⌘T | Ctrl+Shift+T | Alt+Shift+T |

作用于选中的任务行和项目行（组头行不算）；多选时为三态，各行在自己原有的标签上增减。Web 端的 Ctrl+Shift+T 是浏览器「重新打开标签页」，拦截不了，降级为 Alt 系。

### 打开 / 编辑

| 动作 | 全平台 |
|---|---|
| 展开选中任务（行内） | Enter（再按 Enter 聚焦标题编辑，Esc 收起） |
| 保存并收起 | ⌘Enter / Ctrl+Enter |

### 全局

| 动作 | macOS | Windows | Web |
|---|---|---|---|
| 快速查找（Quick Find） | ⌘F | Ctrl+F | Ctrl+F |
| 快速查找（打字唤起） | 直接输入 | 同左 | 同左 |
| Quick Add（系统级） | ⌘⇧Space | Ctrl+Shift+Space | — |
| 开关助手面板 | ⌘J | Ctrl+J | Alt+J |

打字唤起：没有行被选中、焦点不在输入框、没有弹窗时，敲任意可打印字符（可带 Shift，空格除外）即打开快速查找，并把该字符填入输入框；开着中文输入法时，从首键起就在输入法里组字，上屏后再以上屏的文字打开快速查找（页面空闲时由一个隐藏输入框持有焦点来接住输入法）。有 Selection 时单键属于列表操作，不唤起；触控设备与助手页不生效。

助手面板：仅桌面宽度生效；焦点在面板输入框里时同样可以收起面板（其他输入框里让路）。在全屏助手页（`/agent`）按下等同「收回到面板」：回到上一个页面并在面板中打开同一个对话。Web 的 Ctrl+J 是浏览器下载页，降级为 Alt+J。

#### 快速查找面板内：`#tag`

| 动作 | 全平台 |
|---|---|
| 进入 Tag 补全 | 在词首输入 `#` |
| 补全中移动 / 选中（变成 chip） | ↑ / ↓，Enter 或 Tab |
| 退出补全（`#xxx` 留作普通文字） | Esc（再按一次才关闭面板） |
| `#名字` 正好对应唯一的 Tag 时直接转成 chip | 空格 |
| 删掉最后一个 chip | 光标在开头时 Backspace |

有 chip 时只列出命中全部 chip 的区域、项目和任务（按子树命中，chip 之间 AND），搜索词可以为空；「继续搜索」把 chip 带到搜索页（`/search?q=…&tag=…`）。输入法组字中不触发补全和转换。

Quick Add 从 `Cmd/Ctrl+Space` 改为 `Cmd/Ctrl+Shift+Space`：Windows 上 Ctrl+Space 是中文输入法切换键，macOS 上 ⌘Space 是 Spotlight。

#### Quick Add 卡片内（桌面）

| 动作 | macOS | Windows |
|---|---|---|
| 添加并关闭 | ↵（标题框内）/ ⌘↵（任意位置） | Enter / Ctrl+Enter |
| 添加并继续（不关窗、清空草稿、保留归属） | ⇧⌘↵ | Ctrl+Shift+Enter |
| 打开计划日期 | ⌘S | Ctrl+S |
| 设为今天 / Someday | ⌘T / ⌘O | Ctrl+T / Ctrl+O |
| 打开截止日期 | ⇧⌘D | Ctrl+Shift+D |
| 打开 Tag | ⇧⌘T | Ctrl+Shift+T |
| 打开归属（放在哪） | ⇧⌘M | Ctrl+Shift+M |
| 关闭选择器 / 放弃草稿并关窗 | Esc（有选择器开着时先关选择器） | 同左 |

字段键位沿用下方 P1 / P2 的规划键位（主应用里尚未实现，Quick Add 先用上），解析在 `keymap.ts` 的 `resolveQuickAddAction`（注册表 `quickAdd` 作用域，可在设置中改绑，只与卡片内键位判冲突）。系统级唤起键位由 `quick_add_shortcut.rs` 注册与持久化，可在设置中改绑，须含 Ctrl / Alt / ⌘。浮窗是独立 webview，不装配主应用的 KeyboardShortcuts。输入法组字中不响应任何卡片快捷键。

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
| 编辑标签 | ⇧⌘T（已实现，见 P0「标签」） |
| ⌘A 全选后的批量移动/设日期 | 复用上表 |

## 暂缓（域模型/API 缺失，功能落地时一并补键）

| 动作 | Things 键位 | 缺失项 |
|---|---|---|
| This Evening | ⌘E | 无 evening 概念 |
| 重复规则 | ⇧⌘R | 无重复模型 |
| 复制任务 | ⌘D | 无 duplicate API |
| Type Travel | 直接打字跳转 | 决定不做；打字预填搜索亦不做 |
