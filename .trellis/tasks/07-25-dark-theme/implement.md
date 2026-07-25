# Implement: Dark Theme Support

## 执行顺序

### 1. 定义暗色 CSS 变量
- 编辑 `packages/frontend/src/index.css`
- 在现有 `:root { ... }` 块之后、`@layer base` 内新增 `.dark { ... }` 块
- 按设计 D3 的 HSL 值填入，所有 key 与 `:root` 对齐
- 保留 `--radius` 不变（暗色半径不变）

### 2. 新建主题工具函数与 hook
- 新建 `packages/frontend/src/lib/hooks/useTheme.ts`
- 导出：`ThemeMode` 类型、`resolveTheme()`、`applyTheme()`、`applyThemeFromStorage()`、`useTheme()` hook
- hook 返回 `{ mode, resolved, setMode, cycle }`
  - `mode`: 当前存储的 `'light' | 'dark' | 'system'`
  - `resolved`: 实际生效的 `'light' | 'dark'`（用于切换器图标判断）
  - `setMode(m)`: 设置并持久化 + 应用
  - `cycle()`: light → dark → system → light 循环
- localStorage key: `'taskora-theme'`，默认 `'system'`
- 内部用 `useEffect` 注册 matchMedia listener（仅在 mode==='system' 时响应）

### 3. main.tsx 早期应用主题
- 编辑 `packages/frontend/src/main.tsx`
- 在 `ReactDOM.createRoot().render()` **之前**同步调用 `applyThemeFromStorage()`
- 防止首帧闪屏

### 4. Sidebar 添加切换器
- 编辑 `packages/frontend/src/components/layout/Sidebar.tsx`
- 在 Trash NavRow 下方新增主题切换按钮
- 用 `useTheme()` 获取 mode/resolved/cycle
- 图标三态：light → Sun / dark → Moon / system → Monitor（从 lucide-react import，注意 Sidebar 已 import Sun 用于 Today，主题按钮图标用 Moon/Monitor，light 态也用 Sun 但放在不同位置——或统一用 SunMedium）
- 加 `aria-label={当前切换主题，当前：${mode中文名}}`

### 5. 质量检查
- `pnpm --filter frontend tsc --noEmit` 类型通过
- `pnpm --filter frontend lint` 通过（若有 lint 脚本）
- 手工/浏览器验证：
  - 点切换器 → `<html>` class 变化
  - 刷新 → 主题保持
  - 改系统深浅 → system 模式跟随
  - 对比度检查 foreground/background
- grep 核查无新增硬编码色：`grep -rn 'bg-white\|text-black\|bg-black' packages/frontend/src`（记录但不强制修历史）

## 验证命令

```bash
# 类型
cd packages/frontend && pnpm exec tsc --noEmit
# 构建
pnpm --filter frontend build
# 硬编码色核查
grep -rn 'bg-white\|text-black' packages/frontend/src || echo "clean"
```

## 回滚点

每步独立可回滚；CSS 变量、hook、main.tsx 调用、Sidebar 按钮可分别还原。无数据库迁移。