# sqlite::install 覆盖 Builder 的 setup / invoke_handler，session 命令丢失

Status: resolved

## Problem

v0.4.0 Windows 桌面端启动后永远显示「暂时无法恢复登录。请检查网络、服务器连接和本地存储后重试」，点「重试」和「清除本机登录信息并重新登录」都回到同一错误，无法进入登录页或主界面。

## Root Cause

`tauri::Builder::setup` 与 `invoke_handler` 都是**替换**语义（`self.setup = Box::new(...)` / `self.invoke_handler = Box::new(...)`，见 tauri 2.x `app.rs`）。`lib.rs` 先注册了 session 命令与托盘 setup，随后 `sqlite::install(builder)` 再次链式调用 `.setup(...)` 和 `.invoke_handler(...)`，把两者整体覆盖：

- `session_read` / `session_write` 两个 IPC 命令不再注册 → webview 调 `invoke('session_read')` 直接失败；
- `Boot` 组件的 `bootDesktop()` 在 `hydrate()` 就 reject → 显示 `sessionRestoreFailed`；
- 「清除」按钮走 `resetDesktopSession()` → `session_write` 同样失败 → 回到同一错误屏；
- 托盘初始化也被覆盖：关窗驻留（`prevent_close`）生效但没有托盘图标，只能靠二次启动唤回主窗口。

佐证：`session.dpapi` 自升级前最后一次写入后 mtime 不变（写路径完全失效）；存储的 refresh token 从未被消费（手工调用 `/auth/refresh` 返回 200，说明应用根本没发过请求）；Linux CI 编译通过（两个 handler 都合法存在，纯运行时覆盖）。

## Solution

取消模块各自链 Builder 的模式，收敛为单一注册点：

- `sqlite.rs` 删除 `install(builder)`，新增 `manage_state(app)`（只做 `app.manage(ReplicaDb::new(dir))`），由 `lib.rs` 的唯一 setup 在托盘初始化之后调用；
- `lib.rs` 的唯一 `invoke_handler` 合并注册全部六个命令：`session_read` / `session_write` / `sql_exec` / `sql_all` / `sql_run` / `sql_use_db`。

## Testing seams

纯装配层（Builder 注册顺序），无合理单测接缝；以 `cargo check` + `cargo test`（session / sqlite 既有测试）+ Windows 手动验收覆盖：启动恢复登录、托盘菜单、quick-add、本地副本读写。

## Comments

- 该回归由本 feature（`sqlite::install`）引入，v0.3.6 不受影响。
- 后续可改进（未做，保持修复最小化）：`secure-token-store.ts` 把 Rust 侧错误字符串吞掉只抛泛化 i18n 文案，「命令不存在」这类装配错误完全不可见；可考虑透传底层错误辅助定位。
