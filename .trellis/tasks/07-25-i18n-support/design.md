# Design — i18n support (zh/en)

## Architecture

### 库选型：react-i18next

选用 `react-i18next` + `i18next` + `i18next-browser-languagedetector`。

选型理由 / 备选对比：

| 方案 | 优点 | 劣势 |
|------|------|------|
| **react-i18next** ✅ | 生态最主流；`useTranslation` hook 与 React 18 契合；支持 namespace 懒加载、interpolation、plural、Trans 组件；TypeScript 支持好 | 包体略大（~40KB gzip），但对单页应用可接受 |
| react-intl (FormatJS) | ICU MessageFormat 强；TS 类型完善 | API 偏命令式；namespace 懒加载生态不如 i18next；对 React hook 风格不如 react-i18next 自然 |
|自行实现简易字典 | 零依赖 | 缺乏插值、复数、lazy load；后续维护成本高；不符「简洁优先」长期看 |

结论：react-i18next 在生态成熟度、hook 友好性、可扩展性上最优，且不引入自研维护负担。

### 模块边界

```
packages/frontend/src/
├── i18n/
│   ├── config.ts          # i18next 实例配置（资源、检测、fallback）
│   ├── LanguageToggle.tsx # Sidebar 底部语言切换组件
│   └── locales/
│       ├── zh/
│       │   ├── common.json   # 通用词（加载/失败/删除/编辑/取消/确认/…）
│       │   ├── nav.json       # 导航标签
│       │   ├── task.json
│       │   ├── project.json
│       │   ├── area.json
│       │   ├── tag.json
│       │   ├── auth.json      # 登录/注册/登出
│       │   ├── search.json
│       │   └── theme.json     # 主题相关 aria-label
│       └── en/
│           └── (同结构)
├── main.tsx                # import '@/i18n/config' 在 React 渲染前
└── lib/utils/date.ts       # formatDateLabel 接收 locale 参数
```

### Namespace 策略

- 按「页面/领域」切分 namespace：`common`（所有页面共享的加载中/失败/空状态提示）、`nav`、`task`、`project`、`area`、`tag`、`auth`、`search`、`theme`。
- 统一在 `config.ts` 通过 `ns: ['common','nav',...]` 与 `defaultNS: 'common'` 声明。
- 资源以 JSON 静态 import（bundle 内联），避免运行时 fetch 与 Suspense 复杂度（资源体量不大）。

### 语言检测与持久化

`i18next-browser-languagedetector` 配置：

```
detection: {
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: 'taskora-lang',
  caches: ['localStorage'],
}
```

- 仅 zh / en 两个资源；探测到其他（如 ja、fr 等）时由 i18next `fallbackLng: 'en'` 自动回退。
- 显式白名单 `supportedLngs: ['zh','en']`。

### 语言切换 UI

`LanguageToggle` 放在 `Sidebar.tsx` 底部 `<ThemeToggle>` 同一 `<div className="px-2 pb-3 pt-2">` 容器内，二者并排。

交互形态：dropdown（复用现有 `DropdownMenu` 组件），列出「中文 / English」。理由：语言切换不像主题可 cycle（两态），dropdown 更直观且和 Sidebar 顶部用户菜单风格一致。

切换调用 `i18n.changeLanguage(lng)`，detector 的 `caches: ['localStorage']` 会自动持久化，无需手写。

### 日期/数字 locale 格式化

#### formatDateLabel 重构

当前签名 `formatDateLabel(date: Date): string` → 改为依赖当前 i18n locale。

实现方式：
1. 在 `date.ts` 引入 `i18n` 实例（从 `@/i18n/config` 导出 `i18n`），通过 `i18n.language` 获取 locale。
2. 「今天/明天」用翻译 key：`t('date:today')` / `t('date:tomorrow')` ✅
3. 周几：zh 用 `Intl.DateTimeFormat('zh',{weekday:'short'})`（输出「周一」），en 用同 API（输出「Mon」）✅ 避免 `WEEKDAYS` 硬编码数组。
4. 远期日期：`new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)` → zh: 「3月5日」，en: 「Mar 5」 ✅
5. `toDateKey`/`toInputDateValue`/`fromInputDateValue` 保持 ISO `yyyy-mm-dd` 不变（这是数据契约，非展示）。

#### 其他数字格式
- 当前前端无明显的面向用户大数字展示；若 `TaskList` 分组 count 等出现，用 `Intl.NumberFormat(locale)`。多数是 `tasks.length` 直接插值，按需改造，不做过度抽象。

## Data Flow

```
用户操作 → i18n.changeLanguage(lng)
  └→ i18next 更新内部状态
       ├→ localStorage 写入 'taskora-lang'
       ├→ 触发订阅该 instance 的所有 useTranslation() 重渲染
       └→ formatDateLabel 内读取 i18n.language 变化
```

## 兼容性与迁移

- 纯前端变更，不触碰 API、Prisma schema、shared 包。
- `date.ts` 的公共函数签名向后兼容（`formatDateLabel(date)` 仍可单参调用，内部读 i18n）。
- 测试文件中硬编码断言（如 `TaskCheckbox.test.tsx`）需改为基于渲染结果（aria-label 等）的、i18n 无关或传入特定 lng 的断言。

## Trade-offs

- **资源内联 vs 懒加载**：选择内联（静态 import JSON）。资源体量小（~几百 key），避免引入 Suspense 边界与 loading 处理。后续若文案膨胀可切为动态 import。
- **`window.confirm` 保留 vs 替换为 Dialog 组件**：本次保留 `window.confirm`（用 `t()` 拼接文案），不改动交互结构以控制 scope。
- **LanguageToggle 用 dropdown vs cycle**：dropdown 更直观（二选一清晰），与现有 `DropdownMenu` 组件复用一致。

## Rollback

- 改动全部在 `packages/frontend`，且为新增 + 文案替换；如需回滚，`git revert` 本次相关 commit 即可，无 schema/数据迁移副作用。
- 关键文件清单见 `implement.md` 的「Risky Files」。