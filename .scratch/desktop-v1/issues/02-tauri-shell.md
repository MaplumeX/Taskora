# 02: Tauri 2 壳搭建

Status: done

## 背景

ADR-0001 选定 Tauri 2。主力开发平台 Linux（需先装 webkit2gtk 等系统依赖）。

## 内容

1. 新建 `packages/desktop`：Tauri 2 + Vite + React，复用 monorepo 的 TS / ESLint / Prettier 配置。
2. 窗口行为：
   - 关闭按钮按 OS 惯例：macOS 关窗留 Dock（可重开），Windows/Linux 退出进程。
   - 单实例锁（`tauri-plugin-single-instance`）：第二实例启动时把已有窗口拉到前台。
3. 连接模型：设置页可配置服务器地址（存本地），指向自托管部署的 `/api/v1`。纯在线，无本地缓存。
4. 空窗口能跑起来即可，业务 UI 由 03/04 填充。

## 验收标准

- [ ] Linux 上 `pnpm --filter desktop dev` 可启动窗口
- [ ] macOS 关窗后可从 Dock 重开；Linux/Windows 关窗即退出
- [ ] 双开应用第二次启动聚焦已有窗口
- [ ] 服务器地址可配置并持久化

## Comments

Implemented in commit 5fa1f68. Verified on Linux: `pnpm --filter desktop dev` launches the window (webkit2gtk 2.52); second instance exits within 30ms (single-instance lock). Server address configurable via the setup screen, persisted in localStorage (`taskora-desktop-server`) — non-sensitive, so localStorage is acceptable; only the token must live in the keychain.

## Comments (review fixes)

Code review found the hidden quick-add window would keep the event loop alive after closing the main window on Windows/Linux. Fixed: non-macOS main-window close now calls `app_handle().exit(0)` explicitly. Remaining P2 noted for V1.x: no in-app server settings page (currently first-run screen or "Change server" from login).
