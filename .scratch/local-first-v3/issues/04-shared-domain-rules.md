# 04 领域规则共享包

Status: ready-for-agent

## Problem

客户端 Engine 后端（`packages/api/src/engine/*.ts`）与服务端 REST 服务各实现一份领域规则：bucket 推导、视图过滤（today / upcoming / anytime …）、删除与恢复的级联、分组转项目、重复任务派生（ADR-0012 列出三处实现）。Engine 后端里有 17 处注释写着「与 REST 同语义」，漂移只能靠测试发现。

## Design

- 在 `packages/engine`（或新包 `packages/domain`）放纯函数：`resolveTaskBucket`、`resolveProjectBucket`、`taskMatchesView`、`projectMatchesView`、级联计划（给定实体与操作，返回要写的字段补丁集合）、重复实例派生（已在 engine，REST 侧改为调用）。
- Engine 后端与 REST 服务都只做「读 → 调纯函数 → 写」。01 的 `repairEntity` 复用同一组推导函数。
- 共享规则的测试写一份，两端各跑一组「同输入同输出」的契约测试。

## Steps

1. 先迁 bucket 推导与视图过滤（01 已引入 `resolveTaskBucket`）。
2. 再迁级联操作（删除 / 恢复项目、分组转项目、完成重复任务）。
3. 删除两端重复实现，契约测试兜底。

## Acceptance

- 「与 REST 同语义」注释清零；两端规则来自同一份代码。

## Comments
