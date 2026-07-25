# Frontend Views - Execution Plan

## Checklist

### 1. 安装额外依赖
- [ ] lucide-react（图标）

### 2. 任务组件
- [ ] `TaskCheckbox`：复选框 + 完成动画（CSS transition）
- [ ] `TaskDateBadge`：日期标签，今天/明天/过期着色
- [ ] `TaskItem`：复选框 + 标题 + 日期 + project/area 标签 + 右键菜单触发
- [ ] `TaskContextMenu`：右键菜单（完成/取消完成、移到废纸篓）
- [ ] `TaskList`：列表渲染 + 空状态 + loading/error 状态
- [ ] `QuickAddTask`：输入框，回车提交，Esc 取消
- [ ] `TaskDetail`：Dialog 形式，编辑标题/备注、设日期、管理子任务

### 3. 项目与区域组件
- [ ] `ProjectItem`：项目卡片（标题 + 任务数）
- [ ] `ProjectForm`：Dialog 表单（创建/编辑）
- [ ] `AreaItem`：区域卡片（标题 + 项目数 + 任务数）
- [ ] `AreaForm`：Dialog 表单（创建/编辑）

### 4. 视图页面
- [ ] `Inbox`：QuickAddTask + TaskList
- [ ] `Today`：QuickAddTask（dueDate=今天）+ TaskList（过期红色）
- [ ] `Upcoming`：按日期分组 + TaskList
- [ ] `Anytime`：TaskList
- [ ] `Someday`：QuickAddTask（bucket=SOMEDAY）+ TaskList
- [ ] `Projects`：项目列表 + 新建按钮
- [ ] `ProjectDetail`：项目下任务列表 + QuickAddTask
- [ ] `Areas`：区域列表 + 新建按钮
- [ ] `AreaDetail`：区域下项目 + 任务
- [ ] `Trash`：已删除任务列表 + 恢复按钮

### 5. Sidebar 增强
- [ ] 用 lucide-react 图标替换占位
- [ ] Projects/Areas 可展开显示子项
- [ ] 当前激活路由高亮

### 6. 视觉打磨
- [ ] Things3 配色（已在 03 配置，验证一致性）
- [ ] 任务完成动画
- [ ] 空状态设计
- [ ] 过渡动画（页面切换、列表加载）

### 7. Validation
- [ ] `pnpm --filter frontend lint` 通过
- [ ] `pnpm --filter frontend typecheck` 通过
- [ ] `pnpm --filter frontend build` 通过
- [ ] 全流程手动验证：
  - [ ] Inbox 添加任务 → 设置日期 → 出现在 Today
  - [ ] 创建 Project → 分配任务 → 出现在 Anytime
  - [ ] 移任务到 Someday → 出现在 Someday
  - [ ] 完成任务 → 动画 → 消失
  - [ ] 删除任务 → Trash → 恢复
  - [ ] 创建 Area → 分配 Project 到 Area
  - [ ] 子任务管理

## Rollback Points
- 单页面问题：回退该页面组件
- 全局样式问题：回退 Tailwind 配置