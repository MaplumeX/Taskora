# 02: 修复 Android 前台提醒仍不通知

Status: resolved

## 问题

Android 上 Task Reminder 即使保持 App 前台，也可能完全收不到通知。

## 原因

- `notificationIdForKey()` 生成无符号 32 位数字，但通知插件 Rust/原生通知 ID 均为有符号 `i32`/`Int`；部分 Task 的稳定 ID 永远超出上限，注册每次都失败。
- 协调器把「自然到点」当作「应取消」处理，下一个 tick 调用原生 `cancel()`；插件的取消同时撤销待触发排程和已显示通知。
- Reminder 权限读取依赖插件缓存的 `window.Notification.permission`，系统重新授权后本会话仍可能被认为拒绝。
- Reminder 渠道检查缓存成功状态，无法感知用户在系统设置中关闭渠道。

## 修复范围

- 通知 ID 改为稳定有符号 32 位整数，保持同 key 可命中同一系统通知；历史已成功注册的正数 ID 不变。
- 调度差量区分 `due`（自然到点）与 `cancel`（改期/关闭/终态）：移动端自然到点不再撤销系统排程；登出/停止时仍清理待触发项；桌面 runtime 到点补发语义保留。
- 共享 `notification-bridge` 提供实时原生权限查询/请求与渠道检查，Reminder 与状态栏统一使用；回前台时刷新权限状态并重排未来 Reminder。
- 覆盖 ID 边界、自然到期不取消、终态/登出取消、系统重新授权、渠道关闭恢复的回归。

## 验证

- API 全量测试：243/243 通过（含 Reminders 30 项）。
- Mobile 全量测试：59/59 通过（含通知桥接 9 项、Engine 前台恢复 6 项）。
- Engine 全量测试：74/74 通过。
- API / Mobile 类型检查、改动文件 ESLint、Mobile Vite 生产构建、`git diff --check` 通过。
- 未生成/安装 APK，未在真机验证前台与锁屏触发、系统设置恢复、精确排程权限降级延迟及国产 ROM 省电策略；这些仍需真机验收。
