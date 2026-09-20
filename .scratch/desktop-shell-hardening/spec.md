# Desktop shell hardening

Status: done

Desktop 端三项收尾改进(编号沿用 2026-09 桌面端评审):

1. **多账号副本隔离**(`issues/01-per-user-replica-db.md`):`taskora.db`
   固定单文件,切换账号时旧账号的 Sync Cursor / Outbox 会串号
   (旧账号未推的 Outbox 条目被推给新账号,被 hub 拒绝后同步卡死)。
   改为按登录用户分库 `taskora-<userId>.db`。
2. **系统托盘 + 关窗驻留**(`issues/02-system-tray.md`):Windows/Linux
   关主窗口即退出进程,全局快捷键随之失效,与 quick-add「随时唤起」
   的定位冲突。加 tray(Show / New Task / Quit),关窗改为隐藏驻留。
3. **窗口状态记忆**(`issues/03-window-state.md`):接入
   tauri-plugin-window-state,只对 main 生效(quick-add 是居中浮窗,
   不记忆)。

架构基底不变(ADR-0007 Local Replica;SQLite 文件仍是用户数据的
可导出载体,只是从「每设备一份」改为「每用户一份」)。
