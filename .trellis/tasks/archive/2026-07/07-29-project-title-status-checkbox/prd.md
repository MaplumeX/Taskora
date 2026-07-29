# PRD：项目详情标题前增加状态复选框

## 背景

项目（Project）有三种状态：`ACTIVE` / `COMPLETED` / `TRASHED`。当前切换完成状态只能通过项目标题右侧的「更多菜单」或右键菜单中的「标记完成 / 标记未完成」入口，交互路径较长。Things3 等参考应用通常在标题前直接提供复选框，便于一键勾选。

## 需求

在项目详情页（`ProjectDetail.tsx`）的可编辑标题（`InlineTitleEdit`）**正前方**放置一个圆形复选框，点击即切换项目的完成状态（ACTIVE ⇄ COMPLETED），复用已有的 `useCompleteProject` / `useUncompleteProject` 逻辑。

## 范围

- 仅修改前端，不动后端接口。
- 仅项目详情页标题区；侧边栏 `ProjectItem`、Feed 行等其他出现项目标题的位置本次不改。

## 交互细节

- 复选框外观参照 `TaskCheckbox`：圆形、未完成时边框半透明、完成后填充主色并显示 ✓，带 `checkbox-pop` 动效。
- 复选框与标题在同一行、垂直居中，布局 `<checkbox> <title>`，中间留 `gap-2.5` 左右。
- 点击复选框：
  - `stopPropagation`，不触发表单/标题编辑态。
  - 当前 `COMPLETED` → 调用 `uncompleteProject`；否则 → 调用 `completeProject`。
  - 失败时 `toast.error(t('common:saveFailed'))`，与现有菜单行为一致。
- 项目不存在时（加载中/未找到）不渲染复选框。

## 验收标准

1. 项目详情页标题左侧出现圆形复选框，状态正确反映 `project.status === 'COMPLETED'`。
2. 点击复选框在 ACTIVE/COMPLETED 之间正确切换，菜单项状态同步。
3. 点击复选框不会进入标题编辑态、不触发导航。
4. 切换失败有错误 toast。
5. `pnpm typecheck`、`pnpm lint` 通过。
