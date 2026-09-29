# 03 副本 schema 版本与同步协议版本

Status: ready-for-agent

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
