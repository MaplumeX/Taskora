# 02: Android SQLite 存储适配器

Status: done

## 背景

Engine 的 `SqlStorage` 接口（ADR-0007）已有两个实现：node:sqlite（测试）与 desktop 的 rusqlite Tauri IPC。Android 需要第三个实现：Rust 侧 rusqlite command + TS 侧 invoke 适配器。

## 内容

1. Rust 侧：把 desktop `src-tauri` 的 rusqlite command 层搬进 mobile 工程（bundled feature，交叉编译 Android NDK）；command 签名与 desktop 保持一致。
2. TS 侧：`packages/mobile/src/engine/` 新增 `SqlStorage` 适配器，封装 Tauri `invoke`，实现 `exec / all / run / close` 契约（含位置参数绑定）。
3. 不引入 `tauri-plugin-sql` / sqlx（决策见 spec Implementation Decisions）。
4. 多账号副本隔离：数据库文件按用户分库（对齐 desktop-shell-hardening 语义）。

## 验收标准

- [ ] Android 端 Engine 能建库、写入、读取（boot 后 replica 初始化成功）
- [ ] jsdom + mock `invoke` 的适配器契约测试通过（exec/all/run 语义、参数绑定）
- [ ] 断网状态下 Task CRUD 全部可用（Outbox 落库）

## Comments
