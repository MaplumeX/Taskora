# 客户端认可的最低 hub 协议

Status: resolved

## 内容

- `packages/engine/src/protocol.ts` 新增 `MIN_HUB_PROTOCOL_VERSION = 7`，注释写明何时提高（参照 hub 侧 `MIN_SYNC_PROTOCOL_VERSION` 的写法）。
- `engine.ts` 的 `calibrated` 在已有的 `minProtocolVersion` 兜底旁边加上对称检查：`protocolVersion < MIN_HUB_PROTOCOL_VERSION` 时抛 `SyncHubTooOldError`。同步暂停，Outbox 保留，本地读写不受影响。
- 同步状态新增 `hub-too-old`。`SyncIndicator` 常驻提示「服务器版本过旧，请升级服务器」，并补齐 i18n（zh / en）。
- 检查放在 `calibrated` 里、应用响应之前：旧 hub 的 pull / bootstrap 数据不进副本。push 已送达的部分只是旧 hub 认识的字段；抛错后这些条目没有删出 Outbox，下次会幂等重推。
- 与 426 不同，三端调度器（desktop / mobile / web）遇到 `hub-too-old` 不停止定时同步：服务器升级后下一次同步自动恢复。
- `EngineOptions.minHubProtocolVersion`（缺省为常量）：测试用它覆盖连上更旧 hub 时的一次性 resync 路径（标签树 / 附件 / Start）。

## 验收

- engine 单测：hub 回报协议 6 → 抛错，不 push，Outbox 不动。
- SyncIndicator 渲染 `hub-too-old`。
- mobile 调度：`hub-too-old` 后下次 `syncNow` 照常发起并恢复为 synced。

## Comments
