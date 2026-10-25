# 04 提前生成下一份（Next Copy）

Status: implemented

## Problem

想在重复任务 / 项目的下一次到来之前就开始准备（写备注、勾检查项、编辑项目内任务），只能等完成这一次。

## Design

见 spec 第 7 节。要点：

- engine：`nextCopyBlock` / `projectNextCopyBlock`；派生复用完成时的 `planRepeatInstance` / `planRepeatProjectInstance`。
- api：`TaskBackend.createNextCopy`、`ProjectBackend.createProjectNextCopy`（Engine 与 REST 两种实现），hooks `useCreateNextCopy` / `useCreateProjectNextCopy`。
- backend：`POST /tasks/:id/next-copy`、`POST /projects/:id/next-copy`。
- UI：`useNextCopy`；任务右键、展开任务更多、触控单选工具栏、项目右键。

## Acceptance

- engine：阻断原因矩阵；提前生成与完成时派生同一 id。
- api Engine 后端：生成下一份、来源不变、完成来源不再派生、不可重复生成、下一份可再生成；项目整份复制。
- backend e2e：任务与项目 next-copy、409 / 404。
- UI：入口显示 / 隐藏、点击调用。

## Comments

### 2026-10-25 — 实现

- 按设计实现；在 web 前端实际验证：右键「提前生成下一份」→ 提示日期，Repeating 列表同时出现来源与下一份。
- 已知不足：已生成下一份后，来源菜单仍显示「跳过本次」「提前生成下一份」，点击才提示「下一份已存在」（同原有跳过本次的口径：菜单不查派生实例）。后续可让菜单知道来源是否已有派生实例后直接隐藏。
