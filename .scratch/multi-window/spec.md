# 桌面端：多窗口（对齐 Things 3 Mac）

Status: implemented — awaiting manual acceptance

对齐 Things 3 Mac 的多窗口：同一份数据可以同时开多个窗口，各窗口有完整侧边栏，导航、选中、展开互相独立，数据改动实时出现在所有窗口。只做桌面端；web 用浏览器自己的标签页 / 窗口（多标签页已共享 leader Engine，local-first-v3 issue 05）。

参考：[Opening Multiple Things Windows](https://culturedcode.com/things/support/articles/2803580/)。

## 入口

| Things 3 Mac | Taskora 桌面 |
| --- | --- |
| 右上角新窗口按钮：新窗口打开 Today | 同：窗口右上角拖拽带里的新窗口按钮（两个叠放的窗框）。macOS 在窗口最右；Windows / Linux 紧贴自绘窗口按钮左侧。全屏时随拖拽带收起 |
| ⌥ + 点击该按钮：新窗口打开当前列表 | 同（Windows / Linux 为 Alt + 点击） |
| ⌃⌘N：新窗口打开 Today | 快捷键 `newWindow`：mac ⌃⌘N，Windows / Linux Ctrl+Alt+W（Ctrl+Alt+N 已是新建项目），可在设置中改绑；输入框里同样生效；web 不绑定、设置页不显示 |
| 右键项目 / 区域 → Open in New Window | 项目、区域、标签的右键菜单与「…」菜单：「在新窗口中打开」 |
| ⌥ + 右键任务 → Show in Project：新窗口打开所属项目 / 区域 | 任务右键菜单新增「在项目中显示 / 在区域中显示」（单个任务、有归属、不在归属页时），按住 ⌥ / Alt 点击则在新窗口打开；展开任务里的「前往项目 / 区域」同样支持 ⌥ + 点击 |

「在新窗口中打开」只在宿主注册了窗口能力时出现（`setWindowOpener`，同附件 / 通知的平台注入）；web 与 Android 不注册，菜单项不出现，⌥ + 点击退化为普通导航。

## 窗口行为

- 主窗口（`main`）不变：关闭即隐藏到托盘，托盘 / Dock / 二次启动唤出的都是它。
- 副窗口（label `window-<n>`）：与主窗口同样的融合式外壳（ADR 0021）、同样的最小尺寸；尺寸取发起窗口的大小，位置相对发起窗口错开（层叠）。关闭即销毁。
- 不恢复：副窗口不记几何（window-state 插件只跟踪 `main`），退出后重启只有主窗口。
- 登出（任一窗口）：所有副窗口关闭，主窗口回到登录页。副窗口里不会出现登录 / 服务器设置页（会话不存在时直接关闭）。

## 数据：副窗口经主窗口的 Engine 读写

见 ADR 0025。Engine、Outbox、HLC、同步循环、提醒调度、quick-add 中继、托盘只在主窗口。副窗口的 UI 读写一个 `TabEngine`（web 多标签页同一实现，从 frontend 移到 `@taskora/api`），通道换成 Tauri event：调用发给主窗口执行，主窗口广播变更（响应式查询据此重跑）与同步状态（同步指示器）。主窗口的 Engine 不可用（装配失败 / 需要升级）时副窗口随之退回 REST。

窗口各自的：路由、Selection、展开、撤销栈、侧边栏宽度与收起（持久化值共享，运行时互不影响）、助手面板。跨窗口共享的：会话（Web Locks 串行化刷新，已有）、偏好与键位（localStorage + `storage` 事件重读）。

## Out of Scope

- 恢复上次的副窗口（用户决定不做）。
- web「在新窗口中打开」。
- 副窗口自带的托盘 / 菜单栏入口（macOS 应用菜单栏 File → New Window）：目前应用没有原生菜单栏。
