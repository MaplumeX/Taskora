# Taskora Android App Spec

Status: ready-for-agent

移动端（Android 独占）第一版：完整平价的本地优先任务管理 App，GitHub Releases 侧载分发。架构决策见 `docs/adr/0007-local-first-engine.md`（Engine 复用）、`docs/adr/0009-android-keystore-session-token.md`（会话存储）、`docs/adr/0010-tauri-v2-mobile-android.md`（技术选型）。术语见根 `CONTEXT.md`。

## Problem Statement

Taskora 目前只有 Web 与 Windows 桌面端。Local-first 架构（ADR-0007）承诺「每台设备持有全量 Local Replica、Outbox 断网可写」，但出门在外时我手边只有手机：

- 我在地铁里想到一条任务，只能等回到电脑前才录入，快速捕获的心智断了。
- 我在外面想勾掉今天做完的事、看一眼 Today，但手机浏览器里的网页版没有常驻入口，也没有全量离线副本（网页端仍是 REST 优先）。
- Sync Hub 的多设备收敛能力只有桌面一台设备在用，local-first 的价值没有兑现。

## Solution

新建 `packages/mobile`：Tauri v2 的 Android 薄壳（与 `packages/desktop` 平级），复用 `@taskora/ui` 的页面与 `@taskora/engine` 的本地副本机制。

- **完整平价**：Areas / Projects / Tasks / Subtasks / Tags / Buckets / 日历 / 搜索全部可用，不是伴侣应用。网页端已落地的移动交互层（MobileTabBar、MobileNavDrawer、MobileFab、`useLongPress`）直接继承。
- **全量 Local Replica**：与桌面端同语义。存储走 Engine 的 `SqlStorage` 接口，Android 侧为 rusqlite Tauri IPC 适配器（镜像 desktop 的 Rust command 模式）。
- **前台同步**：启动 pull、本地写后 push、回前台 pull、下拉刷新；不引入 FCM 推送与后台周期同步（Outbox 保证断网写不丢）。
- **会话安全**：登录令牌经 Android Keystore 密钥加密后落盘，对齐 ADR-0002 的威胁模型。
- **分发**：GitHub Actions 构建 + 签名（密钥经 secrets 注入），tag 推送自动发布 GitHub Releases，用户侧载 APK。

## User Stories

1. As a Taskora 用户, I want 在 Android 手机上安装 Taskora App, so that 我不必打开手机浏览器也能使用任务管理器
2. As a Taskora 用户, I want 在 App 里登录现有账号, so that 我能访问与其他设备相同的数据
3. As a Taskora 用户, I want 登录令牌被安全存储在设备上, so that root 设备或备份提取也无法读取我的会话
4. As a Taskora 用户, I want 手机持有全量 Local Replica, so that 断网时所有功能仍然可用
5. As a Taskora 用户, I want 在地铁里添加任务到 Inbox, so that 想法即时捕获、联网后自动同步
6. As a Taskora 用户, I want 打开 App 就看到 Today, so that 我能立刻开始今天的工作
7. As a Taskora 用户, I want 通过底部标签栏在 Today / Inbox / Calendar / Anytime 间切换, so that 单手拇指即可完成主导航
8. As a Taskora 用户, I want 通过「更多」抽屉进入 Upcoming / Someday / Logbook / Trash / Tags / Agent 等次级视图, so that 完整功能在小屏上也可达
9. As a Taskora 用户, I want 点击任务打开详情, so that 移动端的浏览-查看路径符合直觉（触控端无 Selection）
10. As a Taskora 用户, I want 用专用 checkbox 勾选完成任务, so that 一条最常用操作不需要进入详情
11. As a Taskora 用户, I want 长按任务弹出行内菜单（与桌面右键同一菜单）, so that 重命名、移动、删除等次级操作在触屏上可达
12. As a Taskora 用户, I want 通过 MobileFab 快速添加任务, so that 移动端的 QuickAdd 一步直达
13. As a Taskora 用户, I want 在手机上创建和管理 Areas、Projects、Project Headings, so that 整理工作不被设备限制
14. As a Taskora 用户, I want 在手机上创建和管理 Tags 与 Tag Groups, so that 标签体系在任意设备一致
15. As a Taskora 用户, I want 在手机上把任务设日期、移入 Someday、转成 Project, so that 任务组织的完整语义可用
16. As a Taskora 用户, I want 查看 Logbook 并按了结日期分组, so that 我能在手机上回顾完成记录
17. As a Taskora 用户, I want 在手机上恢复或永久删除 Trash 中的任务, so that 删除流程在移动端闭环
18. As a Taskora 用户, I want 在手机上使用 Agent 对话（含 SSE 流式回复与批准卡片）, so that 完整平价包含助手功能
19. As a Taskora 用户, I want 在手机上修改设置（语言、主题、BYOK）, so that 不必回到桌面端调整偏好
20. As a Taskora 用户, I want 系统返回手势先关闭打开的抽屉/弹层，全部关闭后才路由返回，根页面再返回才退出, so that 符合标准 Android 导航语义
21. As a Taskora 用户, I want 下拉刷新手动触发同步, so that 我能主动确认服务器上的最新变更
22. As a Taskora 用户, I want 回到前台时自动拉取增量, so that 多设备场景下手机总能看到较新的状态
23. As a Taskora 用户, I want 同步状态（离线/Outbox 排队数）可见, so that 我知道哪些写操作还没收敛
24. As a Taskora 用户, I want 从 GitHub Releases 下载 APK 侧载安装, so that 不需要应用商店也能获取 App
25. As a Taskora 用户, I want 新版本 tag 发布后 Releases 自动出现新 APK, so that 升级路径不需要手工构建
26. As a Taskora 用户, I want 升级安装时签名一致, so that 覆盖安装不需要卸载重装（数据 Local Replica 保留）
27. As a Taskora 用户, I want App 适配深色模式与系统语言, so that 与手机环境一致
28. As a Taskora 用户, I want 虚拟键盘弹出时输入框与 FAB 正确避让, so that 输入和快速添加不被键盘遮挡
29. As a Taskora 用户, I want 多账号切换时各持有独立副本数据库, so that 账号数据不串（对齐 desktop-shell-hardening 的多账号隔离）
30. As a Taskora 用户, I want 离线时界面明确提示, so that 我不会误以为写操作已经同步

## Implementation Decisions

- **平台与框架**：Android 独占，Tauri v2 mobile（ADR-0010）。React 壳 + Rust 侧自定义 command，与 desktop 同构。iOS 明确不做。
- **包结构**：新建 `packages/mobile`，与 `packages/desktop` 平级薄壳：Vite 入口、路由、boot 流程、Tauri Android 工程。页面与业务组件全部来自 `@taskora/ui`；不新建 `ui-mobile` 包。
- **UI 复用**：原地响应式。网页端既有移动层（MobileTabBar / MobileNavDrawer / MobileFab / MobileTopBar / `useLongPress`）是起点；移动端工作以查漏补缺为主（返回手势、键盘避让、虚拟滚动视口），不是重写。触控端无 Selection：点击 = 打开详情（CONTEXT.md 已更新）。
- **存储适配器**：Engine 的 `SqlStorage` 接口不动。Rust 侧把 desktop 的 rusqlite command 层搬进 mobile 的 Tauri 工程（bundled feature 交叉编译 Android NDK）；TS 侧新增 Tauri `invoke` 的 `SqlStorage` 适配器，实现 `exec/all/run/close` 契约。不引入 `tauri-plugin-sql`/sqlx。
- **Engine 接入**：`@taskora/engine` 按桌面端方式接入（boot 时建库、replica 初始化、变更订阅）。数据读取不走 REST。
- **会话存储**：Android Keystore 生成的密钥（不可导出）AES 加密令牌后写入应用私有目录；解锁/解密在 Rust 侧经 JNI 或等价机制完成（ADR-0009）。TokenStore 抽象与 desktop 的注入模式一致。
- **同步触发**：前台同步模型——启动 pull、每次本地写后 push、切回前台 pull、下拉刷新手动触发。不引入 FCM、不做 WorkManager 后台周期同步（后续可选）。Outbox 语义照常。
- **返回手势**：Tauri back-navigation 事件桥接到「关闭 MobileNavDrawer / dialog / sheet → `history.back()` → 根页退出」的级联。
- **分发与签名**：GitHub Actions Android 构建矩阵，release keystore 经 secrets 注入，tag 推触发自动构建并发布 GitHub Releases APK。签名密钥不轮换（升级安装依赖同一签名）。
- **版本**：沿用 monorepo 统一版本号（`pnpm-workspace` 同步，`scripts/release.mjs` 扩展）。

## Testing Decisions

- **好测试的标准**：只测外部行为（用户可见的导航、数据可见性、契约），不测实现细节。
- **存储适配器**：复用 Engine 既有接缝——在 jsdom/mock `invoke` 环境下对 TS 适配器跑 `SqlStorage` 契约（exec/all/run 语义、参数绑定）；Rust 侧直接搬 desktop 已验证的 `sqlite.rs`，不新增 Rust 测试。
- **壳层导航**：镜像 desktop 的 `MainApp.test.tsx` 模式——渲染 mobile 壳 + mock 数据 hooks，断言移动布局（TabBar 可见、抽屉开合、初始落地 Today、返回级联顺序）。`@taskora/ui` 既有移动组件单测不动。
- **Prior art**：`packages/desktop/src/MainApp.test.tsx`、`packages/engine/src/*.test.ts`（replica/merger/position）、`packages/ui/src/components/layout/*.test.tsx`。

## Out of Scope

- iOS（含 Tauri iOS target 的配置预留之外的一切工作）
- FCM 推送与任何服务端面向同步的推送基建
- WorkManager 后台周期同步
- 本地提醒 / 到点通知（Task 目前无提醒字段，提醒是独立 feature）
- 系统分享目标（「分享到 Taskora」）、桌面 Widget
- 应用商店上架（Play Store）与合规审查
- 键盘快捷键 / keymap 层在触屏端的任何适配（自然失效，不处理）

## Further Notes

- CONTEXT.md 的 **Selection** 词条已更新：注明仅存在于键盘交互域，触控端点击 = 打开详情、长按 = 行内菜单。
- 领域模型零变更：本 feature 不新增/修改任何实体与同步语义，纯粹是「同一模型的新设备接入」。
- 侧载用户可能使用无 Play Services 的 ROM——这已计入「不做 FCM」的决策。
- 签名密钥一旦轮换，用户必须卸载重装（Local Replica 会随之丢失），故密钥管理视为高优先级运维事项。
