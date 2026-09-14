# Desktop V1 Spec

Taskora 桌面客户端 V1。基于 Tauri 2（决策见 `docs/adr/0001-tauri-for-desktop.md`）。

## 范围

- **技术栈**：Tauri 2 + React（复用现有 web 技术栈）。
- **架构**：`packages/desktop` 独立成包，持有独立导航壳；业务组件复用自新抽出的 `packages/ui`；数据层复用自新抽出的 `packages/api`。
- **连接模型**：纯在线。可配置服务器地址 + 现有 JWT 登录流。
- **Token 存储**：OS 钥匙串，不用 localStorage。`packages/api` 需要可注入的 token 存储抽象。
- **功能**：主窗口功能与 web 完全对齐（Areas/Projects/Tasks/Subtasks、Buckets、标签、拖拽排序、i18n、软删除）。
- **桌面原生特性（V1）**：
  - 全局快捷键 → 独立悬浮快速添加小窗（纯文本输入，存为任务标题，无自然语言解析）
  - 单实例锁（第二实例启动时把已有窗口拉到前台）
  - 窗口关闭行为按 OS 惯例：macOS 关窗留 Dock，Windows/Linux 退出
- **发布**：tag `desktop-v*` 触发三平台构建（dmg / NSIS exe / AppImage），推 GitHub Releases。V1 无自动更新、无签名。

## 明确不做（V1）

- 离线能力 / 本地同步
- 自然语言日期解析（quick entry 纯文本）
- 托盘常驻、开机自启（V1.x）
- 系统通知（等后端有提醒能力）
- 代码签名、自动更新（待有真实用户后）
- `.deb` / MSI 打包

## Issues

- `issues/01-monorepo-ui-api-split.md` — monorepo 拆分 `packages/ui` 与 `packages/api`
- `issues/02-tauri-shell.md` — Tauri 2 壳搭建
- `issues/03-desktop-auth-keyring.md` — 认证流与钥匙串存储
- `issues/04-desktop-main-window.md` — 主窗口功能对齐
- `issues/05-quick-entry.md` — 全局快捷键 + 悬浮快速添加窗
- `issues/06-desktop-release-ci.md` — 发布 CI 与分发
