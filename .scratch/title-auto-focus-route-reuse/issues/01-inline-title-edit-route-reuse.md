# 新建 Project/Area 后标题输入框未自动聚焦（路由组件复用）

Status: resolved

## 现象

桌面端（web 端同样受影响）新建 Project/Area 后，详情页的标题没有进入
编辑态、输入框未聚焦。触发条件：**当前已处于某个 Project（或 Area）
详情页**时，从侧边栏「新增」菜单再新建一个 Project（或 Area）。

从其他页面（Today 等）新建则一切正常。

## 根因

- 新建流程：`setPendingAutoEditId(p.id)` → `navigate('/projects/:id')`
  → `ProjectDetail` 读取 `pendingAutoEditId === id` 传给
  `InlineTitleEdit` 的 `autoFocusAndSelect`。
- `InlineTitleEdit` 的编辑态来自
  `useState(autoFocusAndSelect)` —— **初始值只在首次挂载时生效**。
- 当路由从 `/projects/old-id` 变为 `/projects/new-id` 时，React Router
  复用 `ProjectDetail` 组件实例（同一路由 pattern，仅 params 变化），
  `InlineTitleEdit` 不重新挂载，`autoFocusAndSelect` 的 `false → true`
  转换无人响应 → 永远停留在展示态（h1）。
- `/areas/:id`（AreaDetail）同理。`ProjectHeadingRow` 不受影响：它已用
  effect 响应 `autoEdit` 变化。

## 修复

`InlineTitleEdit` 增加 effect 响应 `autoFocusAndSelect` 转为 `true` 时
进入编辑态（与 `ProjectHeadingRow` 的 auto-edit 处理对齐；父级
（ProjectDetail/AreaDetail）在转换后清除 pending id，`true → false`
不应退出编辑态）。

## 验证

- `packages/desktop/src/TitleAutoFocus.test.tsx`：
  - 从 /today 新建 → 聚焦（原有行为回归）；
  - 从 /projects/p-0 新建 → 聚焦（本 bug 回归点，复用桌面 MainApp 的
    MemoryRouter + Suspense + lazy 结构，并叠加 engine 写后
    invalidate → refetch 替换缓存数组的时序）。
- 全量测试：ui 202 / desktop 37 / frontend 6 通过；tsc、eslint 通过。
