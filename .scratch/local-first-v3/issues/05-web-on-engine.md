# 05 web 接入 Engine，退役 REST 写旁路

Status: ready-for-agent
Blocked by: 04

## Problem

web 仍是 thin client，写入走 REST、绕过合并器。hub 因此维护：字段摘要检测（推断 REST 改了哪些字段）、虚拟设备 0 按 `updatedAt` 合成时钟、collector tap 把 REST 写转成变更事件、`sortOrder` 与 `position` 双排序键。已知后果：回声导致界面闪烁（已修）、REST 写与日志之间的崩溃窗口（ADR-0007 记录）、时钟口径（已由校准缓解）。

## Design

两步走：

1. **REST 写经合并器**（中间态，改动小）：REST 服务不再直接写 Prisma，而是构造字段级事件交给 `SyncHubService.submitVirtualWrite`（虚拟设备 0，hub 墙钟 HLC）。变更日志与数据同事务，崩溃窗口消失；摘要检测只剩兜底用途。
2. **web 跑 Engine**（ADR-0007 原计划）：`@sqlite.org/sqlite-wasm` + OPFS 作为 `SqlStorage` 实现，web 与桌面共用同一 Engine 与后端注入。OPFS 不可用时（隐私模式、旧浏览器）回退为 1 的 REST 路径。之后退役摘要检测、`sortOrder` 排序键与 collector tap 的同步分支。

## Risks

- OPFS 同源单写者：多标签页需要一个 leader（SharedWorker / Web Locks）持有数据库。
- 首次加载要 bootstrap 全量数据（与 08 的分页一起做）。

## Acceptance

- 第 1 步：REST 写入与日志同事务；删除摘要检测后回声测试仍通过。
- 第 2 步：web 断网全功能；多标签页一致。

## Comments
