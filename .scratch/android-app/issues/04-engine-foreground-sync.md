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

### 2026-10-02：移除下拉刷新

下拉刷新（同步触发点 4，含 spec 用户故事 21 与 issue 05 真机待验证项中的「下拉刷新」）已移除。Quick Find（#121）上线后，列表页下拉同时触发刷新与搜索，手势冲突；下拉现在只归 Quick Find。

手动刷新的场景已被其余触发点覆盖：启动 pull、本地写后 push、回前台 pull，以及 SSE 远端变更提示触发 pull。`PullToRefresh` 组件与 `requestPullSync()` 一并删除，前台同步收敛为三个触发点（见 `packages/mobile/src/engine/mobile-engine.ts`）。
