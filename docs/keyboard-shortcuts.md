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
| 侧边栏上一个 / 下一个列表 | ⌃⌥⌘↑ / ↓ | Ctrl+Alt+Shift+↑ / ↓ | Ctrl+Alt+Shift+↑ / ↓（macOS 上 ⌃⌥⌘↑ / ↓ 同样可用） |
| 进入选中的项目 / 区域 | ⌘→ | Ctrl+→ | Ctrl+→ |
| 在父列表中显示 | ⌘L | Ctrl+L | Alt+L |
| 导航弹窗 | ⇧⌘O | Ctrl+Shift+O | Alt+Shift+O |

侧边栏导航按侧边栏当前显示的行（助手、各 Bucket、回顾 / 日志 / 废纸篓、区域与其下展开的项目、稍后项目入口、标签）逐个跳转，到头不循环。Windows 没有独立的 ⌃，⌥⌘↑ 已归「移到顶」（Ctrl+Alt+↑），侧边栏导航加 Shift。

进入：选中项目行（含分组视图的项目组头）进入项目页，选中区域组头进入区域页。在父列表中显示：任务 → 所属项目 / 区域；无归属的按计划落到 Today / Upcoming / Someday / Anytime / Inbox；项目 → 所属区域（无区域的项目不动作）。跳转后在目标页选中该行并滚入视野；已在父列表中时不动作。Web 的 Ctrl+L 是地址栏，降级为 Alt+L。

导航弹窗：不输入时列出全部内置列表（同 Quick Find 可搜到的列表：各 Bucket、稍后项目、废纸篓、标签），其后是与侧边栏同序的区域与项目；输入即按名称过滤（前缀命中优先，中英文名都认）。↑/↓ 移动，Enter 前往，Esc 关闭。它只跳转列表，不搜任务（搜任务用 ⌘F）。Web 的 Ctrl+Shift+O 是书签管理器，降级为 Alt+Shift+O。

### 选择（Selection）

| 动作 | 全平台 |
|---|---|
| 上移 / 下移选中 | ↑ / ↓ |
| 选中首项 / 末项 | Alt+↑ / Alt+↓ |
| 扩展 / 收缩多选 | ⇧↑ / ⇧↓ |
| 多选扩展到顶 / 到底 | ⌥⇧↑ / ⌥⇧↓ |
| 全选（批量完成/删除） | ⌘A / Ctrl+A |

鼠标多选：⌘+点击（macOS）/ Ctrl+点击（Windows、Linux）切换单行，⇧+点击选中锚点（上次单选或 ⌘/Ctrl+点击的行）到该行的连续范围。多选只含任务行，⇧↑/↓ 跳过 Heading、项目、组头。完成、取消、删除、打标等键位作用于全部选中行。

多项拖拽：拖动多选中的一行时其余选中行收起，被拖条目始终贴着手，浮层显示件数；松手后整组按原显示顺序落在落点，随之改归属（分组视图）、Heading（项目页）或计划日期（Upcoming），多选保留。拖动未选中的行仍只拖它自己。

覆盖范围：8 个 Bucket 页（Inbox/Today/Upcoming/Anytime/Someday/Logbook/Trash/Calendar）+ Project/Area/Tag 详情页。遍历时 Heading 行可被选中跳过。

Grouped View（今天/随时/某天按项目/区域分组）补充规则：

- Alt+↑/↓ 在组边界处钳制（组内首/末行，组块首行即组头），任务不会经键盘离开所在组。
- Group Header 上 Enter 打开项目/区域详情（与项目行一致），Space（下方新建）在该父级内创建任务。分组不可折叠（组头是下横线小节标题，无折叠按钮与对应键位）。

### 创建

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 新任务 | ⌘N | Ctrl+N | Alt+N |
| 选中项下方新建 | Space | Space | Space |
| 新项目 | ⌥⌘N | Ctrl+Alt+N | Alt+Shift+N |
| 新 Heading | ⇧⌘N | Ctrl+Shift+N | Alt+H |
| 用选中任务新建 Heading | ⌥⇧⌘N | Ctrl+Alt+Shift+N | Alt+Shift+H |
| 在打开的任务里新建子任务 | ⇧⌘C | Ctrl+Shift+C | Alt+Shift+C |

用选中任务新建 Heading：仅项目页（且未按 Tag 过滤）；新 Heading 插在首个选中任务所在分组之后（选中任务在无 Heading 部分时成为第一个 Heading），选中任务按显示顺序归入，随后进入 Heading 标题编辑。没有选中任务时等同新 Heading。

新建子任务：作用于展开的任务；只选中未展开时先展开再新建。焦点在该任务的标题 / 备注输入框里时同样生效。Web 的 Ctrl+Shift+C 是开发者工具，降级为 Alt+Shift+C。

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

### 复制

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 复制选中项（Duplicate） | ⌘D | Ctrl+D | Ctrl+D |

作用于选中的任务行和项目行（组头、Heading 不算），多选时按显示顺序逐个复制；Trash 中不响应。副本紧跟来源（任务在列表中、项目在侧边栏中），完成后选中副本；Logbook 中复制出的任务是未完成的，落回原列表，选中不变。规则见 CONTEXT.md「Duplicate」。右键菜单与项目页「…」菜单同样提供「复制」（项目页复制后打开副本）；触控设备在左滑多选工具栏的「更多」里复制勾选的任务，复制后退出多选。Web 的 Ctrl+D 是浏览器「加入书签」，可以拦截，与桌面同键。

### 剪贴板

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 复制选中的任务 / 项目 | ⌘C | Ctrl+C | Ctrl+C |
| 粘贴 | ⌘V | Ctrl+V | Ctrl+V |
| 把复制的条目移到当前列表 | ⌥⌘V | Ctrl+Alt+V | Ctrl+Alt+V |

- ⌘C：本机记下选中的任务 / 项目行（组头、Heading 不算），同时把标题（每行一个）写进系统剪贴板。没有选中条目、或页面上有选中的文字时让给原生复制；焦点在输入框里时同样不拦截（⌘C / ⌘V 在输入框里始终是原生行为）。
- ⌘V：系统剪贴板仍是 ⌘C 写入的那段文字（或读不到剪贴板）→ 粘贴条目：在原处复制出副本（同 ⌘D），再把副本放到当前列表（规则同 Sidebar Drop：Inbox / Today / Anytime / Someday / 项目 / 区域；标签页给副本加上该标签；其余页面副本留在原处），选中副本。剪贴板是外部文字 → 每行建一个任务（去掉 `- ` `* ` `1. ` `[ ]` 等列表记号与空行），带当前页的新建上下文，有选中任务时排在其下方，建完选中新任务。Trash、Logbook 中不粘贴条目。
- 没有行选中时 ⌘V 不再把文字粘进打字唤起的 Quick Find，而是建任务（对齐 Things）。
- 系统剪贴板：桌面端走原生剪贴板（tauri-plugin-clipboard-manager，不弹任何确认）；Web 用浏览器 Clipboard API，Chromium 首次读取会询问权限，被拒绝时 ⌘V 只粘贴本机记下的条目。
- ⌥⌘V：把 ⌘C 记下的条目移到当前列表（规则同上，已在目标处的跳过），并选中它们；当前页没有确定的位置（Upcoming、Logbook、搜索等）时提示不可移入。

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

字段键位与主应用的「日期」「移动 / 排序」键位一致，解析在 `keymap.ts` 的 `resolveQuickAddAction`（注册表 `quickAdd` 作用域，可在设置中改绑，只与卡片内键位判冲突）。系统级唤起键位由 `quick_add_shortcut.rs` 注册与持久化，可在设置中改绑，须含 Ctrl / Alt / ⌘。浮窗是独立 webview，不装配主应用的 KeyboardShortcuts。输入法组字中不响应任何卡片快捷键。

### 回顾（Review Mode）

| 动作 | macOS | Windows | Web |
|---|---|---|---|
| 标记已回顾并进入下一个 | ⌥⌘R | Ctrl+Alt+R | Alt+Shift+R |
| 延后（打开延后菜单） | ⌥⌘L | Ctrl+Alt+L | Alt+Shift+L |
| 下一个（不标记） | ⌥⌘→ | Ctrl+Alt+→ | Alt+Shift+→ |
| 上一个 | ⌥⌘← | Ctrl+Alt+← | Alt+Shift+← |

只在回顾模式（`/review`）中生效，其他页面按下不拦截。Web 的 Alt+← 是浏览器后退，统一用 Alt+Shift 系；⇧⌘R 预留给重复规则，mac 用 ⌥⌘R。

## 日期

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 打开计划日期（When）卡片 | ⌘S | Ctrl+S | Alt+S |
| 计划为 Today / Anytime / Someday | ⌘T / ⌘R / ⌘O | Ctrl+T / Ctrl+R / Ctrl+O | Alt+T / Alt+R / Alt+O |
| 计划日期 ±1 天 | ⌃] / ⌃[ | Ctrl+] / Ctrl+[ | 同左 |
| 计划日期 ±1 周 | ⌃⇧] / ⌃⇧[ | Ctrl+Shift+] / Ctrl+Shift+[ | 同左 |
| 打开截止日期卡片 | ⇧⌘D | Ctrl+Shift+D | Alt+Shift+D |
| 截止日期 ±1 天 | ⌃. / ⌃, | Ctrl+. / Ctrl+, | 同左 |
| 截止日期 ±1 周 | ⌃⇧. / ⌃⇧, | Ctrl+Shift+. / Ctrl+Shift+, | 同左 |
| 打开重复规则卡片 | ⇧⌘R | Ctrl+Shift+R | Alt+Shift+P |

作用于选中的任务行与项目行（组头、Heading 不算），多选时逐项写入、卡片不预选值；Trash 与 Logbook 中不响应。卡片同右键菜单的「计划」「截止日期」「重复」，锚定在最后一个选中行。

- Today / Anytime / Someday 与 Sidebar Drop 落在对应行同一套规则：已符合的条目跳过；Anytime 让无归属的任务离开 Inbox。
- 计划日期步进：已过的计划日期按今天对待，无计划 / Someday 从今天起算，结果不早于今天。
- 截止日期步进：有截止日期的在原值上加减（可退到过去）；没有的从今天起算、不落到过去。
- 重复规则只对单个 DATE 型条目（规则以计划日期为锚点），否则提示先设计划日期。Web 的 Alt+Shift+R 已归回顾模式，重复规则走 Alt+Shift+P。
- 带 Shift 的标点键位按物理键识别（⌃⇧] 的 key 是 `}`）。Windows 中文输入法开着时 Ctrl+. 可能被输入法用于切换中英文标点，可在设置中改绑。

## 移动 / 排序

| 动作 | macOS 桌面 | Windows 桌面 | Web |
|---|---|---|---|
| 移到其他列表 | ⇧⌘M | Ctrl+Shift+M | Alt+Shift+M |
| 上移 / 下移 | ⌘↑ / ⌘↓ | Ctrl+↑ / Ctrl+↓ | Ctrl+↑ / Ctrl+↓ |
| 移到顶 / 底 | ⌥⌘↑ / ⌥⌘↓ | Ctrl+Alt+↑ / Ctrl+Alt+↓ | Ctrl+Alt+↑ / Ctrl+Alt+↓ |

移到其他列表：同右键菜单的「移动」（任务：Inbox / 区域 / 项目；项目：区域 / 无区域），多选整组移动。

排序：多选作为一个整块移动。只在拖拽可排序的同级行之间移动、不经键盘改归属：项目页在同一 Heading 下（按 Tag 过滤时停用，同拖拽），分组视图在同一组（或顶部未分组区）内，Upcoming 在同一天内。写回走与拖拽松手相同的排序路径。Logbook、Trash、Calendar 不可排序。

## 全局（补充）

| 动作 | macOS | Windows | Web |
|---|---|---|---|
| 显示 / 隐藏侧边栏 | ⌘/ | Ctrl+/ | Ctrl+/ |

仅桌面宽度生效。

## 暂缓（域模型/API 缺失，功能落地时一并补键）

| 动作 | Things 键位 | 缺失项 |
|---|---|---|
| This Evening | ⌘E | 无 evening 概念 |
| Type Travel | 直接打字跳转 | 决定不做；打字预填搜索亦不做 |
