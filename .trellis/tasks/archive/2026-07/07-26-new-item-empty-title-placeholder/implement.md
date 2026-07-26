# Implement: 新建任务/项目/区域空标题占位符

## 执行清单（按顺序）

### 1. i18n 文案

- [ ] `src/i18n/locales/zh/task.json`：加 `"newTaskPlaceholder": "新建任务"`，删 `"newTask": "新任务"`
- [ ] `src/i18n/locales/en/task.json`：加 `"newTaskPlaceholder": "New Task"`，删 `"newTask": "New Task"`
- [ ] `src/i18n/locales/zh/project.json`：加 `"newItemPlaceholder": "新建项目"`
- [ ] `src/i18n/locales/en/project.json`：加 `"newItemPlaceholder": "New Project"`
- [ ] `src/i18n/locales/zh/area.json`：加 `"newItemPlaceholder": "新建区域"`
- [ ] `src/i18n/locales/en/area.json`：加 `"newItemPlaceholder": "New Area"`

### 2. 新建任务：去掉默认标题

- [ ] `src/components/layout/ContentBottomBar.tsx:34`：`title: t('task:newTask')` → `title: ''`；移除 `t` 中 `task:newTask` 引用（如果 `t` 不再需要 task namespace 则检查 import）

### 3. 任务列表占位符 + 自动聚焦判定

- [ ] `src/components/task/TaskItem.tsx:61`：`current.title === t('task:newTask')` → `current.title === ''`
- [ ] `src/components/task/TaskItem.tsx` 折叠态 span（~111-117 行）：`{current.title}` → `{current.title || t('task:newTaskPlaceholder')}`，空标题时加 `text-muted-foreground`
- [ ] `src/components/task/TaskItem.tsx` 展开态 Input（~103 行）：加 `placeholder={t('task:newTaskPlaceholder')}`

### 4. 项目/区域列表占位符

- [ ] `src/components/project/ProjectItem.tsx:20`：`{project.title}` → `{project.title || t('project:newItemPlaceholder')}`，空标题加 `text-muted-foreground`
- [ ] `src/components/area/AreaItem.tsx:20`：`{area.title}` → `{area.title || t('area:newItemPlaceholder')}`，空标题加 `text-muted-foreground`

### 5. 项目/区域详情页 placeholder

- [ ] `src/pages/ProjectDetail.tsx:51`：`placeholder={t('project:titlePlaceholder')}` → `placeholder={t('project:newItemPlaceholder')}`
- [ ] `src/pages/AreaDetail.tsx:106`：`placeholder={t('area:titlePlaceholder')}` → `placeholder={t('area:newItemPlaceholder')}`

### 6. 验证

- [ ] `cd packages/frontend && npx tsc -b --noEmit`
- [ ] `cd packages/frontend && npx eslint src/components/layout/ContentBottomBar.tsx src/components/task/TaskItem.tsx src/components/project/ProjectItem.tsx src/components/area/AreaItem.tsx src/pages/ProjectDetail.tsx src/pages/AreaDetail.tsx`
- [ ] i18n key parity 校验：`for f in task project area; do diff <(jq -S 'keys' src/i18n/locales/zh/$f.json) <(jq -S 'keys' src/i18n/locales/en/$f.json) && echo "✓ $f"; done`
- [ ] 手动验证：新建任务 → 空标题、占位符显示、自动聚焦；新建项目/区域 → 列表+详情页占位符显示

## 回滚点

每步独立，可单独 revert。i18n 改动（步骤 1）与组件改动（步骤 2-5）耦合度低，但步骤 2-5 依赖步骤 1 的 key 存在。

## 风险文件

- `TaskItem.tsx`：改动较密集（自动聚焦判定 + 折叠态展示 + 展开态 placeholder），需注意 `useTranslation` 的 namespace（当前无显式 namespace，用 defaultNS `common`，需用 `t('task:newTaskPlaceholder')` 带前缀跨 namespace 调用）。
- `ContentBottomBar.tsx`：去掉 `t('task:newTask')` 后确认 `t` 仍有其他用途（有：`task:searchTasks`、`task:addTask`、`common:createFailed`），`useTranslation` 无 namespace 调用保持不变。