# 04: Engine 接入与前台同步触发

Status: done

## 背景

Android 端与桌面端同语义接入 Engine：全量 Local Replica，读写全部走本地副本。同步采用前台触发模型（无 FCM、无后台周期同步）。

## 内容

1. Engine 接入：boot 时建库/开库、replica 初始化、UI 数据 hooks 改读 Engine（镜像 desktop 模式）。
2. 同步触发点：
   - 启动完成后 pull（Sync Cursor 增量）
   - 每次本地写经 Outbox flush 后 push
   - App 从后台切回前台时 pull（监听 Tauri 生命周期事件）
   - 下拉刷新手动触发 pull
3. 同步状态可见：复用 SyncIndicator（离线/Outbox 排队数）。
4. 断网行为验证：全部写操作落 Outbox，恢复联网后自动收敛。

## 验收标准

- [ ] 手机断网时全功能 CRUD 可用，联网后自动收敛到 Sync Hub
- [ ] 前台触发四场景（启动/写后/回前台/下拉）各自产生预期的 pull/push 行为
- [ ] 离线提示与 Outbox 计数正确显示
- [ ] 手机与桌面双端并发编辑同一 Task 后按字段级 LWW 收敛

## Comments
