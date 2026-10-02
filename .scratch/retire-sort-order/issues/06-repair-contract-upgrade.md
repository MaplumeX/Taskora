# 06 修复有历史数据的 contract 升级与 P3009 恢复

Status: resolved

## Problem

`20261002180000_drop_sort_order` 假设中间版本 hub 已在启动时物化 Position，但该 hook 已删除，且 migrate deploy 先于应用启动。旧库直升会在 guard 失败后永久停在 P3009。空库 CI 无法发现此问题。

## Design

- 修正已发布的 contract 迁移（记录旧 checksum）：事务内按历史 Engine 算法补齐七张表的空 Position，再断言、删列；已有 Position、updatedAt、字段时钟及同步日志不动。
- bootstrap 用专用 PostgreSQL 会话锁串行化检查、恢复和部署；只恢复原迁移 checksum + 明确 guard 错误 + 完整旧列状态的唯一失败记录。未知失败或部分 DDL 状态保持失败，输出操作指引。
- 用真实 PostgreSQL 验证 SQL/Engine parity、旧版本与跳版升级、失败状态、重复执行、空库、并发和异常中断。CI 在实际镜像上验证升级后健康检查。
- 发布纪律：分阶段发布不等于可以删除历史数据转换；用户跳过中间版本仍须可升级。

## Acceptance

- 旧数据可直接经 migrate deploy 完成原子升级；全部七表 Position 非空，sortOrder 已删除。
- 已知 P3009 状态通过新 backend 启动自动恢复，未知失败绝不自动 resolve。
- 原有 Position 和同步元数据保留；回填与协议 4 Local Replica 逐字一致，非 UTC 会话不影响结果。
- 同时启动与二次执行安全，故障日志含可执行诊断。

## Answer

已实现自包含、显式事务的 SQL 回填（O(log sortOrder)，不依赖会话时区），以及 `src/migrations/deploy.ts` 的专用 pg 会话锁和严格原始故障恢复。旧文件作为原始 checksum fixture 保留；已成功执行旧迁移的库无需改历史记录。修正后的迁移若被中断会整体回滚，但其 Prisma 失败记录保留，人工检查后才 resolve；resolve 后、deploy 前重启可自动继续。

验证环境：PostgreSQL 17-alpine，Prisma 6.19.3，实际 backend Docker 镜像。

- 新增迁移测试 18/18：SQL/Engine 跨 radix/日期/时区 parity、七实体 Local Replica 7 → 9 一致性、N−1/N−2、真实 P3018 → P3009 恢复、未知指纹 / 部分 DDL 拒绝、并发、锁超时、故障注入原子回滚、重复执行、原 checksum 已成功状态。
- backend 全量 327/327，Engine 全量 229/229；backend typecheck/build、改动文件 ESLint、diff whitespace 检查通过。
- 镜像 smoke 4/4：v0.7.1、v0.7.2、P3009、空库，均健康且七表 Position / sortOrder 验证通过。
- CI 已接入历史 tag DDL + 合成 fixture 的实际镜像健康检查；部署恢复与发布纪律记录在 `docs/versioning-and-deployment.md`，ADR-0007 已更正原先对阶段发布的错误假设。

尚未发布镜像；本修复不改变 Compose 的 restart/depends_on 策略。
