# Desktop: 开机自启在升级后被悄悄关闭

Status: resolved

## 背景

用户反馈：明明开过开机自启，隔一段时间发现没有自启，打开设置开关是关的。

01 的方案以系统登录项为唯一事实来源、无额外持久化。项目未接入 `tauri-plugin-updater`，升级靠手动运行新版安装包；Tauri NSIS 模板（CLI 2.11.4）在检测到旧版时会先执行旧卸载程序，且**只有 updater 路径才追加 `/UPDATE`**。卸载段里：

```nsis
${If} $UpdateMode <> 1
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
```

于是每次手动升级都会删除 Windows 的自启注册表项，设置页读到的系统状态自然是关。

## 方案

壳层持久化用户意图（`app_data_dir/launch-at-login.json`，卸载默认不删），启动时与系统登录项对账（`src-tauri/src/launch_at_login.rs`）：

| 意图 | 系统 | 动作 |
| --- | --- | --- |
| 开 | 开 | 重写登录项刷新可执行路径（macOS 跳过：每次写 LaunchAgent 会弹「后台项目」通知） |
| 开 | 关，Run 值丢失 | 补回（被安装包删除） |
| 开 | 关，Run 值在但 StartupApproved 禁用（Windows） | 尊重任务管理器的禁用，意图改为关 |
| 无 / 关 | 任意 | 以系统状态为准记下意图（老用户迁移、系统设置里重新启用） |

- debug 构建跳过对账：开发版与正式版共用登录项名与数据目录，避免把自启指向 `target/debug`。
- 设置页改走壳层命令 `launch_at_login_get` / `launch_at_login_set`（切换时同时写意图），不再使用 `@tauri-apps/plugin-autostart` guest-js；相应移除 `autostart:default` 权限与 JS 依赖。

## 已知限制

升级到含本修复的版本那一次仍会被旧卸载程序删除（此时还没有意图文件），需要在设置里重新打开一次；之后的升级不再丢失。

## 验证

- `cargo test --lib launch_at_login`（对账决策表）、`cargo clippy` 通过；Windows 注册表读取段用独立 crate `cargo check --target x86_64-pc-windows-msvc` 通过（整包交叉编译受 libsqlite3-sys 工具链限制）
- `@taskora/ui` vitest 309 全过（新增桌面开关 3 条），ui / desktop typecheck、eslint、prettier 通过

## Comments
