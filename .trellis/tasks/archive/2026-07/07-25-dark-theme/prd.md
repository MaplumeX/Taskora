# PRD: Dark Theme Support

## 背景

当前项目采用 shadcn/ui 方案（CSS 变量 + HSL + Tailwind），`tailwind.config.js` 已配置 `darkMode: ['class']`，但 `src/index.css` 仅定义了 `:root` 一套浅色变量，**没有 `.dark` 选择器**；前端 `src/` 全局搜 `dark` 零匹配——无主题切换器、无系统偏好跟随、无持久化。暗色模式等于不存在。

## 目标

补齐暗色主题能力，让用户可以使用暗色界面，并能跟随系统偏好或手动切换，选择被持久化。

## 需求

### R1 – 暗色调色板

在 `src/index.css` 中新增 `.dark` 选择器，定义与浅色一一对应的暗色 CSS 变量。调色板需满足：

- 与现有浅色变量**同 key 对齐**（background / foreground / card / popover / primary / secondary / muted / accent / destructive / border / input / ring / radius）
- primary 保持 Things3 蓝（浅色用 `218 45% 54%`，暗色背景上需调整为感知亮度更高的同色相值，避免暗底上视觉发闷）
- 文本/边框对比度满足可读性（foreground vs background 对比度 ≥ 4.5:1，参照 WCAG AA）
- 不引入新变量 key，保持 Tailwind config 不变

### R2 – 主题状态管理

新增 `useTheme` hook（或薄 store），职责：

- 读取/设置主题模式：`'light' | 'dark' | 'system'`
- `system` 模式下根据 `window.matchMedia('(prefers-color-scheme: dark)')` 解析为实际 `light` / `dark`
- 将用户选择持久化到 localStorage（key: `taskora-theme`，值 `light|dark|system`）
- 在 `<html>` 元素上切换 `.dark` class（与 Tailwind `darkMode: ['class']` 一致）
- 监听系统主题变化；当用户选择 `system` 时，系统切换则同步应用

### R3 – 避免首屏闪屏（FOUC）

在 React 挂载前（`main.tsx` 中、渲染之前）同步执行一次主题初始化：读取 localStorage，解析系统偏好，在 `<html>` 上加/去 `.dark` class。不能等到 React 渲染后再加 class，否则浅色→暗色会有一帧闪屏。

### R4 – 切换器 UI

在 Sidebar 底部（Trash 导航项下方）放置一个主题切换按钮：

- 图标按钮，当前为浅色显示 `Sun`、暗色显示 `Moon`、system 模式显示 `Monitor`（或用 `CloudSun`，与 Sidebar 现有 `CloudSun` 用于 Someday 区分，需选不冲突图标——倾向用 `Monitor`）
- 点击循环切换：light → dark → system → light
- 有 `aria-label`（如 `切换主题，当前：浅色`）
- 不新增设置页；切换单点在 Sidebar

### R5 – 全局样式覆盖核查

所有页面/组件在暗色下不应出现：

- 硬编码白色/黑色背景的 inline 样式（如标签徽章用 `style={{ backgroundColor: tag.color }}` 是数据色不受影响，但需确认没有 `bg-white` / `text-black` 等 Tailwind 硬编码类）
- 自定义动画 keyframe 颜色若用到具体色需对暗色兼容（核查 `task-complete` / `checkbox-pop`，目前仅 opacity/transform，应无需改）

## 验收标准

1. **暗色变量就位**：`src/index.css` 存在 `.dark` 选择器，所有 `:root` 中的 key 在 `.dark` 中都有对应定义。
2. **切换生效**：点击 Sidebar 主题按钮，`<html>` 的 `.dark` class 正确切换，界面整体变暗/变亮，无残留白底。
3. **持久化**：刷新页面后主题保持上次选择（light / dark / system 三态均能恢复）。
4. **system 跟随**：设为 `system` 时，改变操作系统深浅模式，UI 实时切换（`matchMedia` listener 生效）。
5. **无 FOUC**：刷新页面时不出现"先浅后暗"的闪屏（主题在 React 渲染前已应用）。
6. **对比度达标**：暗色下 foreground/background 对比度 ≥ 4.5:1（WCAG AA），关键文本（muted-foreground）可读。
7. **无硬编码色**：grep `bg-white` / `text-black` / `bg-black` / `text-white` 在 `src/` 下无新增违规（历史违规若存在则记录但不强制本次修）。
8. **切换器可访问**：按钮有 `aria-label`，键盘可聚焦操作。

## 非目标（Out of Scope）

- 多 accent 主题色（除蓝色外的橙/绿/紫等）——本次不做
- 主题透明度 / 毛玻璃效果——本次不做
- 设置页——本次不做，切换单点在 Sidebar
- 后端 API——主题纯前端，无后端改动