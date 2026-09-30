# 11 实时提示跨 hub 实例

Status: needs-triage

## Problem

变更日志已持久化并在实例间共享，但「有新变更」的 SSE 提示来自进程内的 `ChangeEventHub`。连到另一实例的设备收不到提示，退化为 30 秒轮询。单实例部署不受影响。

## Design

- 变更日志写入时 `pg_notify('sync_changes', userId)`（与日志同事务，提交后才投递）。
- 每个实例 `LISTEN sync_changes`，收到后向本实例上该用户的 SSE 连接推送提示。
- 不引入 Redis 等新依赖。

## Acceptance

- 两实例部署下，连到实例 B 的设备在秒级收到实例 A 上发生的变更提示。

## Comments
