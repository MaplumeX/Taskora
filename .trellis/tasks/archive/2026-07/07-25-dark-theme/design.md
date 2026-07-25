# Design: Dark Theme Support

## 技术决策

### D1 – 主题状态：hook 还是 Zustand store？

**决策**：用独立 hook `useTheme`，**不放入 Zustand**。

**理由**：
- 项目 state-management 规范明确："Zustand 仅放 auth/token 等跨页面持久状态"。主题偏好虽也持久，但不参与服务端数据流、不跨页面共享业务状态，更像 UI 层关注点。
- 当前只有 `auth.store.ts` 一个 Zustand store，没有引入 UI store 的先例。
- 主题的核心副作用是操作 DOM class + localStorage + matchMedia listener，这些用 `useEffect` 在 hook 内管理最直接，引入 store 反而多一层间接。
- 跨组件订阅主题值的需求只有一个消费者（Sidebar 切换器图标），用 hook + 闭包变量足够。

**实现形态**：导出 `useTheme()` 返回 `{ mode, resolved, setMode, cycle }`。内部用 `useState` 存 `mode`，`useEffect` 同步 DOM 与 localStorage，`useEffect` 注册 matchMedia listener。

### D2 – FOUC 防护：内联脚本 vs main.tsx 早期同步执行

**决策**：在 `main.tsx` 的 `ReactDOM.createRoot().render()` **之前**同步调用一个 `applyThemeFromStorage()` 纯函数。

**不选 `index.html` 内联脚本**：
- Vite 项目结构清晰，内联脚本散落 HTML 不便维护与测试。
- `main.tsx` 是入口，在 render 前同步执行也能保证首帧前 class 已就位（React 渲染本身是首次绘制前）。

**实现**：
```ts
// theme.ts
export type ThemeMode = 'light' | 'dark' | 'system';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function applyThemeFromStorage() {
  const stored = (localStorage.getItem('taskora-theme') as ThemeMode) ?? 'system';
  applyTheme(stored);
}
```
`main.tsx` 顶部调用 `applyThemeFromStorage()`。

### D3 – 暗色调色板取值

参照 shadcn/ui 官方暗色变量并按 Things3 蓝色 brand 调整 primary。HSL 全部对齐 `:root` 的 key：

```css
.dark {
  --background: 222 23% 10%;        /* 深蓝灰底 */
  --foreground: 210 20% 92%;        /* 浅灰白文本，对比度充足 */

  --card: 222 23% 12%;
  --card-foreground: 210 20% 92%;

  --popover: 222 23% 12%;
  --popover-foreground: 210 20% 92%;

  --primary: 218 65% 62%;           /* 暗底上提亮，感知亮度更高 */
  --primary-foreground: 0 0% 100%;

  --secondary: 222 20% 16%;
  --secondary-foreground: 210 20% 92%;

  --muted: 222 20% 16%;
  --muted-foreground: 215 16% 65%;  /* 次要文本，保持可读 */

  --accent: 222 20% 18%;
  --accent-foreground: 210 20% 92%;

  --destructive: 0 63% 50%;
  --destructive-foreground: 0 0% 98%;

  --border: 222 18% 22%;
  --input: 222 18% 22%;
  --ring: 218 65% 62%;
}
```
注：以上数值会在实现时用浏览器对比度工具复核，目标 foreground/background ≥ 4.5:1，muted-foreground 可读。

### D4 – 切换器图标选择

Sidebar 已用 `Sun`（Today）、`CloudSun`（Someday），主题切换器**不能用 Sun**避免与 Today 导航图标视觉冲突。

**决策**：使用 `Moon` / `SunMedium` / `Monitor` 三态显示……（实现时从 lucide-react 选可用的对应图标，确保与 Sidebar 已有图标不冲突）。

### D5 – 系统偏好监听

`useTheme` 内部：
```ts
useEffect(() => {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (mode === 'system') applyTheme('system');
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}, [mode]);
```
仅在 `mode === 'system'` 时响应，light/dark 不受系统变化影响。

## 文件影响

| 文件 | 改动 |
|---|---|
| `src/index.css` | 新增 `.dark { ... }` 选择器块 |
| `src/lib/hooks/useTheme.ts` | 新建：mode 状态 + applyTheme + matchMedia listener + localStorage 读写 |
| `src/main.tsx` | 在 render 前 import 调用 `applyThemeFromStorage()` |
| `src/components/layout/Sidebar.tsx` | 底部新增主题切换按钮（主题按钮 + aria-label + cycle 切换） |

## 风险与回滚

- **对比度不达标**：实现时用浏览器 DevTools 量对比度，必要时微调 HSL 值。
- **组件硬编码色**：PRD R5 已列入核查；若发现 `bg-white` 等历史硬编码，本次仅记录不强制修，避免范围蔓延。
- **回滚**：改动集中在 4 个文件，回滚 `git revert` 即可；无 schema/数据迁移。