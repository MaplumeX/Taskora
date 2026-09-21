# 新建任务后展开行标题输入框未自动聚焦（temp/real 重复条目竞态）

Status: resolved

## 现象

项目页 / 领域页新建任务后，任务行展开但标题输入框没有聚焦（焦点落在
body）。Today / Inbox 等 feed 视图正常。桌面端（engine 后端）必现；
web 端在 SSE 缓存手术与 mutation 竞争时同样可能出现。

## 根因

新建动作的链路（useContentBottomActions.handleAddTask）：

1. `useCreateTask.onMutate` 乐观插入 temp 任务（tempId）到所有
   `['tasks']` 前缀的列表缓存；
2. 桌面端 mutationFn（engine createTask）写本地副本后**同步**触发
   `notifyChanged({origin:'local'})` → `invalidateQueries(['tasks'])`，
   refetch 在 mutation resolve 之前就把 temp 行冲成真实行（web 端对应
   SSE 缓存手术直接写入真实行）；
3. `useCreateTask.onSuccess` 无条件把真实行**前插**进列表：
   tempId 已不在列表时也执行 `[task, ...old]` → **同 id 重复条目**；
4. `setExpandedId(realId)` 后两个同 key 的 TaskItem 渲染，React 去重
   调和时展开行被卸载重建，聚焦 rAF 被取消 → 焦点丢失。

feed 视图不受影响：feed 列表不做乐观插入，新任务在 invalidate →
refetch 之后才出现，TaskItem 挂载即 expanded，聚焦 effect 正常。

## 修复

`useCreateTask` / `useCreateProject` / `useCreateArea` /
`useCreateSubtask` 的 onSuccess 幂等化：过滤掉 tempId **和已存在的
真实 id** 后只插入一次，并发缓存更新先落地也不会产生重复条目。

## 验证

- 真实浏览器（chromium + 桌面壳 vite dev + REST mock）复现与修复
  验证：修复前项目页/领域页 `activeElement=BODY`（行数轨迹 2→3→2
  可见重复阶段），修复后 `INPUT/New Task` 且 2s 后仍保持聚焦。
  复现方法：mock 服务器在 POST /tasks 处理中先写库并推 SSE change
  帧（模拟 engine 写后失效），延迟响应（模拟 taskDto 组装 IPC）。
- 单测回归（packages/api）：三个 create hooks 各补「并发缓存更新已
  冲掉 temp 时不重复」用例。
- `packages/desktop/src/TaskAutoFocus.test.tsx`：engine 式后端
  （写后同步 invalidate + 延迟 resolve）+ 真实 ProjectDetail 完整链路。
- 全量测试：api 150 / ui 202 / desktop 38 / frontend 6 通过。
