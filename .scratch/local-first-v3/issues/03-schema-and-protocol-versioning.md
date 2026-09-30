# 03 副本 schema 版本与同步协议版本

Status: implemented — awaiting desktop acceptance

## Problem

- 副本迁移：`LocalReplica.init` 逐列检查 `pragma_table_info`，缺什么 ALTER 什么。没有版本号，无法表达「数据迁移」（改值而非加列），也无法拒绝比自己新的副本。
- 同步协议：请求与响应没有版本。新客户端新增实体类型 → 旧 hub 的 DTO 校验 400，设备永远重试；旧客户端收到不认识的字段 → 静默丢弃；新增枚举值 → 已由 hub 纠正（2026-09），但只是版本差异的一种表现。

## Design

- **副本**：`PRAGMA user_version` 记录 schema 版本；`migrations: Array<(storage) => Promise<void>>` 顺序执行，每步一个事务。现有「按列 ALTER」收编为 v1 → v2 … 的迁移。打开比代码更新的副本（降级安装）时拒绝并提示。
- **协议**：push / pull / bootstrap 请求带 `protocolVersion`（整数）与客户端版本；hub 响应带 `minProtocolVersion`。低于最低版本 → hub 返回 426，客户端停止同步并显示「请升级」，Outbox 保留。hub 对「更新的协议」按能力降级：未知实体类型的事件不再让整批 400，而是逐条拒绝并在响应里列出（与 10 的诊断打通）。
- 协议版本的升级规则写进 ADR-0007。

## Acceptance

- 老副本升级、新建副本、降级安装三种路径有测试。
- 过旧客户端看到升级提示而不是「永久离线」；新旧客户端混用时不再有静默分叉。

## Comments

**2026-09-29 实现记录**

副本：
- `packages/engine/src/migrations.ts`：`PRAGMA user_version` + 只追加的迁移列表，每步一个事务、版本号同事务提交。新库直接建到最新版本（当前 4）；旧库（user_version 0）第 1 步补齐缺失的表，之后的加列步骤用 `addColumnIfMissing`（对 DDL 已带该列的库是空操作）。原 `LocalReplica.init` 里的按列 ALTER 收编为 1→2（Outbox kind / revision）、2→3（reminderTime）、3→4（repeatRule）。
- 降级安装：版本高于代码 → `ReplicaSchemaTooNewError`。桌面 / 移动端装配时捕获：不打开副本、退回 REST，同步指示器显示「需要升级 Taskora 才能同步」。
- 副本在 pull / bootstrap 中跳过不认识的实体类型（以前会在事务里崩溃，设备永远同步失败）。

协议：
- `SYNC_PROTOCOL_VERSION = 1`；版本与客户端标识走请求头 `x-taskora-sync-protocol` / `x-taskora-client`，不放请求体——hub 的全局 ValidationPipe 开了 forbidNonWhitelisted，旧 hub 会把带新字段的请求整批 400；GET 也没有请求体。
- hub 每个同步响应带 `protocolVersion` / `minProtocolVersion`；低于最低版本回 426。`MIN_SYNC_PROTOCOL_VERSION = 0`（不带版本头的现有客户端继续可用）。
- hub push：DTO 的 entity 放宽为字符串；不认识的实体（字段写与 Delete Request）逐条拒绝，不认识的字段在合并其余字段的同时列出，都放在 `PushResponse.rejected` 里。
- Engine flush：被拒的条目留在 Outbox，本轮跳过、其余照常确认；以后的同步重推，hub 升级后被接受。响应里 `minProtocolVersion` 高于本端时也抛 `SyncUpgradeRequiredError`（兜底）。
- HTTP transport 收进 `@taskora/api`（`createHttpSyncTransport(platform)`），桌面 / 移动端的 `http-transport.ts` 只绑定平台标识。426 → `SyncUpgradeRequiredError` → 调度器停止同步（桌面端清掉周期定时器）、显示升级提示；本地读写照常，Outbox 保留；重新登录会重试。
- 升级规则写进 ADR-0007「Replica schema and sync protocol are versioned」。

测试：engine `test/versioning.test.ts`（新建 / 旧库升级 / 降级拒绝 / 迁移中途失败后重开；旧 hub 拒绝未知实体后 hub 升级送达；跳过未知远端实体；426 兜底）；backend hub 服务逐条拒绝、DTO、`assertSyncProtocol`；api transport 版本头与 426 映射；mobile 调度器 426 与降级安装；SyncIndicator 升级态。engine 116、api 300、ui 314、desktop 51、mobile 68、backend 308 个测试通过（backend 需要数据库的 5 个 e2e 文件被跳过）。

待验收：
- 桌面端从旧副本（升级前的安装）启动，确认数据与未同步编辑都在，`PRAGMA user_version` 为 4。
- 已知限制：以后若提高 `MIN_SYNC_PROTOCOL_VERSION`，本版本之前的客户端不认识 426，只会显示「离线」；从本版本起的客户端才会看到升级提示。

