# i18n Guidelines

> How internationalization works in this project.

---

## Overview

- 库：`react-i18next` + `i18next` + `i18next-browser-languagedetector`
- 支持语言：`zh`（中文）、`en`（English），其他语言自动 fallback 到 `en`
- 入口配置：`src/i18n/config.ts`（导出 `i18n` 实例）
- 资源文件：`src/i18n/locales/{zh,en}/*.json`，按 namespace 切分

---

## Architecture

```
src/i18n/
├── config.ts           # i18next 实例配置（资源静态 import、检测、fallback）
└── locales/
    ├── zh/             # 中文资源（9 个 namespace JSON）
    └── en/             # 英文资源（同结构，key 集合必须与 zh 一致）

> 语言 / 主题切换入口位于 `components/layout/SidebarBottomBar.tsx`（侧边栏底栏右侧“设置”按钮的下拉菜单内）。
```

### Namespace 划分

按「页面/领域」切分：`common`（共享词，defaultNS）、`nav`、`task`、`project`、`area`、`tag`、`auth`、`search`、`theme`。

### 语言检测与持久化

```typescript
detection: {
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: 'taskora-lang',
  caches: ['localStorage'],
}
supportedLngs: ['zh', 'en'],
fallbackLng: 'en',
```

- localStorage key：`taskora-lang`（与 `taskora-theme`、`taskora-auth` 同前缀约定）
- 切换语言调 `i18n.changeLanguage(lng)`，detector 自动持久化，无需手写 localStorage

---

## Conventions

### Convention: 初始化时机（FOUC 防护）

**What**：`main.tsx` 必须在 `ReactDOM.createRoot().render()` 之前 `import '@/i18n/config'`。

**Why**：与主题 FOUC 防护同理。i18n 实例必须同步初始化完成，否则首帧渲染时 `useTranslation` 拿不到实例，文案为 key 而非值。

**Example**：
```typescript
// main.tsx
import '@/i18n/config';          // ← 在 React render 前
import { applyThemeFromStorage } from '@/lib/hooks/useTheme';
import '@/index.css';

applyThemeFromStorage();
// ReactDOM.createRoot().render(...)
```

### Convention: 组件内用 `useTranslation`，工具代码用 `i18n.t`

**What**：
- React 组件内：`const { t } = useTranslation('namespace')`（订阅语言变化，自动重渲染）
- 非 React 工具代码（如 `lib/utils/date.ts`）：`i18n.t('common:today')`（直接读运行时值）

**Why**：工具函数不是组件，无法用 hook；`i18n.t` 在运行时读取当前语言，切换后下次调用自动返回新值。

**Example**：
```typescript
// ✅ 组件内
function TaskItem() {
  const { t } = useTranslation('task');
  return <span>{t('emptyHint')}</span>;
}

// ✅ 工具函数内
import { i18n } from '@/i18n/config';
export function formatDateLabel(date: Date): string {
  if (isToday(date)) return i18n.t('common:today');
  // ...
}
```

### Convention: 模块级常量数组用 `labelKey`，不在顶层调 `t()`

**What**：模块顶层（文件作用域）的 const 数组（如 `mainNav`）不能调用 `t()`，因为 i18n 实例可能尚未 init。改用 `labelKey` 字符串，在组件内通过 `useTranslation` 解析。

**Why**：模块顶层代码在 import 时立即执行，此时 `i18n.init()` 可能未完成，`t()` 会返回 key 本身。

**Example**：
```typescript
// ❌ Wrong — 模块顶层调 t()，i18n 未就绪
const mainNav = [
  { to: '/inbox', label: t('nav:inbox'), icon: Inbox },  // t 未定义/未就绪
];

// ✅ Correct — 存 labelKey，组件内解析
interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}
const mainNav: NavItem[] = [
  { to: '/inbox', labelKey: 'nav:inbox', icon: Inbox },
];
function NavRow({ item }: { item: NavItem }) {
  const { t } = useTranslation('nav');
  return <NavLink to={item.to}>{item.label}</NavLink>;
  //                       ^ 在组件内用 t(item.labelKey) 解析
}
```

### Convention: zh/en key 集合必须一致

**What**：每个 namespace 的 zh.json 与 en.json 必须有完全相同的 key 集合。

**Why**：缺失的 key 会在某语言下 fallback 到 key 字符串本身或 fallbackLng，造成用户看到 `nav.inbox` 这样的原始 key。

**校验**：
```bash
for f in common nav task project area tag auth search theme; do
  diff <(jq -S 'keys' src/i18n/locales/zh/$f.json) \
       <(jq -S 'keys' src/i18n/locales/en/$f.json) && echo "✓ $f"
done
```

### Convention: 日期 locale 格式化

**What**：面向用户的日期展示用 `Intl.DateTimeFormat(i18n.language, …)`，不硬编码 `WEEKDAYS` 数组或 `toLocaleDateString('zh-CN', …)`。

**Why**：硬编码数组/locale 字符串无法随语言切换动态变化；`Intl` API 原生支持所有 locale。

**Example**（`lib/utils/date.ts`）：
```typescript
import { i18n } from '@/i18n/config';

export function formatDateLabel(date: Date): string {
  if (isToday(date)) return i18n.t('common:today');
  if (isTomorrow(date)) return i18n.t('common:tomorrow');
  const locale = i18n.language;
  // 近期 → 周几；远期 → 月日
  if (diff > 0 && diff <= 6) {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
}
```

---

## Common Mistakes

### 模块顶层调用 `t()` 导致文案显示为 key

**Symptom**：某些文案显示为 `nav.inbox` 这样的 key 字符串，而非翻译值

**Cause**：在模块顶层 const 数组中直接调用 `t()`，此时 i18n 尚未 init

**Fix**：改用 `labelKey` 字符串字段，在组件内通过 `useTranslation()` 解析（见上方 Convention）

### 变量遮蔽 i18n 的 `t` 函数

**Symptom**：调用 `t('task:xxx')` 报错 `t is not a function`，或调用了错误的函数

**Cause**：组件/函数内已有同名变量 `t`（如 `const t = someString.trim()`），遮蔽了 `useTranslation()` 返回的 `t`

**Fix**：重命名冲突变量（如 `const trimmed = title.trim()`），避免与 i18n `t` 函数同名

### 新增文案时只加了一种语言的 key

**Symptom**：另一语言下显示 key 字符串或 fallback 到错误语言

**Fix**：每次新增 key 必须同时在 `zh/*.json` 和 `en/*.json` 添加。用 `locale/date.ts` 同样的校验命令检查 parity。