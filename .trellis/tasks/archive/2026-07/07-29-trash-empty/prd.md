# Empty trash feature

## Goal

在废纸篓页面提供「倾倒废纸篓」入口,一键永久删除当前用户已软删除(status=TRASHED)的全部任务和项目,不可恢复。

## Background (已确认事实)

- 废纸篓是聚合视图:前端 `Trash.tsx` 通过 `useFeedQuery('trash')` 展示当前用户所有 `status=TRASHED` 的 task + project。
- 当前只有软删除(`remove` 置 TRASHED)和恢复(`restore` 回 ACTIVE),**无永久删除入口**。
- Prisma schema 中:
  - `TaskTag` / `ProjectTag` 关联表使用 `onDelete: Cascade` —— 物理删除主记录时关联自动清理,无需手工处理。
  - `Task.parentId` 使用 `onDelete: NoAction` —— 永久删除仍有子任务引用的父任务会触发 FK 约束错误,必须在事务中显式处理子任务(决策 B:级联删后代)。
  - `Task.projectId` 引用 `Project`,schema 未声明 `onDelete`(默认 NO ACTION)—— 永久删除 trashed project 时,若仍有 task 引用其 `projectId`,会触发 FK 约束错误,必须显式处理(决策 B':级联删 project 下属全部 task)。

## Requirements

### 功能需求
1. 废纸篓页面顶部提供「倾倒废纸篓」操作入口。
2. 点击后,在执行前弹出确认对话框,文案明确「不可恢复」语义,二次确认后才执行。
3. 执行时:永久删除当前用户所有 `status=TRASHED` 的 task 和 project(物理 deleteMany)。
4. 空废纸篓(feeds 返回空)时,入口禁用或隐藏,避免无意义操作。
5. 执行成功后:
   - 使前端 `['feed']`(及相关详细查询)失效并重新拉取,列表清空。
   - 显示成功 toast。
6. 执行失败时显示失败 toast,不做部分删除(事务原子性)。

### 非功能需求 / 约束
- 永久删除必须限定 `userId` + `status=TRASHED`,绝不误删非软删除项。
- 删除操作必须原子(task/project/关联在同一事务内完成,或分两事务但各自原子,失败回滚不留残项)。
- 不改动现有「软删除」「恢复」流程。

## Acceptance Criteria

- [ ] 废纸篓页面顶部存在「倾倒废纸篓」入口。
- [ ] 空废纸篓时入口禁用或隐藏。
- [ ] 点击入口弹出确认对话框,显式提示「不可恢复」。
- [ ] 确认后:当前用户废纸篓内所有 task/project 被永久删除,不可恢复。
- [ ] 子任务 FK 约束不报错(按 design.md 中的子任务策略处理)。
- [ ] 成功后 list 清空、相关 query 失效、toast 提示。
- [ ] 失败时 toast 提示,无部分删除残留。
- [ ] 不影响其他用户的数据(userId 隔离)。

## Decisions (已确认)

- **子任务处理策略 = B**:永久删除 trashed 父任务时,其所有后代(无论 active/completed/trashed)一并永久删除。理由:用户接受级联删除以换取实现简洁。

- **trashed project 下属任务策略 = B'**:永久删除 trashed project 时,其下所有任务(无论状态)一并永久删除。理由:用户接受级联删除以保持一致性。

## Out of Scope

- 自动定时清空废纸篓(如 30 天后自动倾倒)。
- 单条永久删除(本次只做「清空全部」)。
- 撤销 / 倒计时恢复(倾倒即永久)。
