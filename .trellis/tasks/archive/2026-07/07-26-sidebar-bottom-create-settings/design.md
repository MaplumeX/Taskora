# Design — 侧边栏底栏新增/设置按钮与标题内联编辑

## 影响范围

- `packages/frontend/src/components/layout/Sidebar.tsx` — 底栏重构 + 新增按钮菜单逻辑。
- `packages/frontend/src/components/layout/SidebarBottomBar.tsx`（新） — 抽离底栏组件，含新增按钮、设置按钮、设置菜单内容。
- `packages/frontend/src/components/project/InlineTitleEdit.tsx`（新） — 通用标题内联编辑组件，供 ProjectDetail / AreaDetail 复用。
- `packages/frontend/src/pages/ProjectDetail.tsx` — 标题改用 `InlineTitleEdit`；读取 `location.state.editTitle` 初始进入编辑态。
- `packages/frontend/src/pages/AreaDetail.tsx` — 同上。
- `packages/frontend/src/i18n/locales/{zh,en}/*.json` — 新增 key。
- 无后端 / shared 改动。

## 关键设计决策

### D1 "直接创建空条目"的实现方式

后端 `CreateProjectDto.title` 是 `@IsString()`（不带 `@IsOptional()`），允许空字符串通过校验（class-validator 的 `@IsString()` 不限定非空）。采用方案：

- 创建时直接发送空标题（`title: ''`），创建成功后导航到详情页，标题进入编辑态（输入框初始为空并被 focus + 不需 select）。
- 侧边栏 / 列表中暂时显示空白条目是用户明确接受的取舍：用户未输入标题前，该条目以空标题存在；用户在详情页输入并提交后即变为真实标题。
- `InlineTitleEdit` 的 `autoFocusAndSelect` 语义在空标题场景调整为：创建后进入编辑态、focus 输入框，不调 `select()`（空内容无意义）。

理由：用户明确要求"完全空标题"，不使用默认占位标题，避免占位文案进入数据库。

### D2 内联编辑触发机制

通过 `react-router` 的 `location.state` 传递信号：

```ts
navigate(`/projects/${newProject.id}`, { state: { editTitle: true } });
```

- 详情页从 `useLocation().state` 读取 `editTitle`，若为 true 则初始 `editing=true`。
- 信号是一次性的（不持久化到 URL，刷新即丢失），符合"刚创建时编辑"的语义，避免刷新后仍自动进入编辑态。

### D3 通用 `InlineTitleEdit` 组件契约

单一组件同时服务项目与区域详情页，避免重复实现。

```tsx
interface InlineTitleEditProps {
  value: string;
  placeholder?: string;
  autoFocusAndSelect?: boolean;          // 用于新建后自动进入编辑态
  onSubmit: (next: string) => void;      // trim 后非空时调用
  className?: string;
  titleClassName?: string;
}
```

行为：
- `display` 态：`<h1>` 级别元素（保持现有样式），点击进入 `edit` 态。
- `edit` 态：受控 `<input>`，ref + effect 在挂载/进入编辑时 `focus()` + `select()`。
- `Enter` / 失焦 → 提交；`Escape` → 取消。
- 提交逻辑：
  - `trim()` 后为空 → 不调用 `onSubmit`，标题回滚到 `value`，toast 提示 `common:titleRequired`。
  - 与原值相同 → 仅退出编辑态，不调用 `onSubmit`。
  - 否则调用 `onSubmit(next)`。
- 外部 `onSubmit` 由调用方实现保存 mutation + 成功 toast + 退出编辑态。提交过程中 `isPending` 时禁用 input（避免重复提交）。

### D4 设置菜单的组织

`SidebarBottomBar` 内部渲染一个 `DropdownMenu`：
- 触发器：齿轮图标按钮。
- 内容：
  - 主题项：沿用 `ThemeToggle` 的 cycle 逻辑，点击 `cycle()`；当前模式下显示对应图标 + label（light/dark/system）。
  - 语言项：显示当前语言标签 + 子菜单或直接列出 `中文` / `English`（与现状一致，直接列出更简单）。

为保持改动最小、行为一致，实现为一个 `DropdownMenu` 包含两组（用 `DropdownMenuSeparator` 分隔）。不抽取新的 settings store。

### D5 保留对话框编辑流程

详情页的"编辑"按钮仍打开 `ProjectForm` / `AreaForm`（提供编辑 notes 等附加字段），内联编辑仅覆盖标题。两个流程互不冲突。

## 数据流

### 新增项目流程

```
SidebarBottomBar 新增菜单
  └─ onClick 新增项目
      └─ createProject.mutate({ title: '' })
          └─ onSuccess: navigate(`/projects/${id}`, { state: { editTitle: true } })
              └─ ProjectDetail 读取 location.state.editTitle
                  └─ <InlineTitleEdit autoFocusAndSelect />
                      └─ 用户输入 + Enter → updateProject.mutate({ id, data: { title } })
```

### 新增区域流程

同上，使用 `createArea` / `/areas/:id`。

### 标题内联编辑（任意时刻）

```
ProjectDetail 渲染 <InlineTitleEdit value={project.title} onSubmit={handleTitleSubmit} />
  where handleTitleSubmit(next) =
    updateProject.mutate({ id, data: { title: next } }, {
      onSuccess: () => toast.success(t('common:saved')),
      onError:   () => toast.error(t('common:saveFailed')),
    })
```

`InlineTitleEdit` 内部管理 `editing` 状态与提交规则；调用方仅关心保存副作用。

## 边界与兼容性

- 路由 state 失效（如刷新）→ 退化为普通展示态，不影响功能。
- `InlineTitleEdit` 作为受控展示组件：`value` 由父级从 query 数据派生，mutation 成功后 query 失效 → `value` 自动更新 → 如果父级 `editing` 还是 true，input 内容会被外部新值覆盖并结束编辑态（在 `onSubmit` 成功回调中由父级将 `editing=false` 关闭；但 `editing` 在 `InlineTitleEdit` 内部，需通过 key 重置或暴露受控接口）。
  → 决策：`InlineTitleEdit` 内部自管 `editing`，`onSubmit` 在调用方完成时由组件自身关闭；若保存失败，保持编辑态供用户重试。需要提供 `submitting` 受控 prop？为最小化，组件内部用 `useUpdateProject` 的 `isPending` 不可达——改为：`onSubmit` 返回 void，`InlineTitleEdit` 在调用后立即结束编辑态（乐观关闭），失败 toast 由父级处理。若失败，标题已回退到原值或新值？失败时 query 不刷新，`project.title` 仍是旧值，`InlineTitleEdit` 的 `value` 仍是旧值，组件关闭编辑后展示旧标题，用户可再点编辑重试，体验可接受。
  → 最终决策：`InlineTitleEdit` 在提交（非空且与原值不同）后立即退出编辑态，不等待 mutation；父级 mutation 成功/失败仅负责 toast。失败时标题由 query 旧值（未变化）展示。

## 回滚形态

纯前端改动，回滚即还原 `Sidebar.tsx`、`ProjectDetail.tsx`、`AreaDetail.tsx` 并删除新增的两个组件文件即可。无 schema / 迁移。