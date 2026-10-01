# Windows：微软雅黑观感差，改用自托管 Noto Sans SC

Status: done

## 背景

Windows 端中文字体一直是微软雅黑（`Microsoft YaHei UI`）：字面偏大、笔画末端生硬、
小字号下灰度偏重，在 12px 的 `text-meta` / 13px 的 `text-section` 上尤其明显。

关键约束：**Windows 没有任何更好的预装中文字体**——等线更细且不适合 UI，宋体 /
黑体是上古产物。所以调整系统字体栈无解，只能自托管。

本 issue 修正 `.scratch/things3-visual-language/spec.md`「字体」一节的全系统字体决策：
macOS 的 PingFang SC 屏显质量很好、不动；Windows 是唯一需要自托管的平台。

## 方案

分平台字体栈，靠「逐字符回退 + web font 惰性加载」实现，**不需要平台检测 JS**：

```js
'-apple-system', 'BlinkMacSystemFont',   // macOS 拉丁 → SF
'"PingFang SC"',                         // macOS 中文 → 本地命中即停
'"Noto Sans SC Variable"',               // Windows 拉丁+中文 → 自托管
'"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui',
'"Microsoft YaHei UI"', '"Microsoft YaHei"', '"Noto Sans CJK SC"',
'sans-serif',
```

原理：`font-family` 逐字符取第一个含该字形的字体，而 `@font-face` 只有真被用到才下载。

- **macOS**：`-apple-system` / `PingFang SC` 本地命中即停 → Noto Sans SC 零下载。
- **Windows**：Apple 系字体不存在 → 落到自托管 Noto Sans SC；西文用其自带拉丁字形
  （源自 Source Sans，与汉字配套，不打架）。
- 系统字体全部降为兜底，覆盖字体加载失败与生僻字。

### 为什么用 @fontsource

`@fontsource-variable/noto-sans-sc`（SIL OFL）提供**按 `unicode-range` 切好的 101 个
woff2 分片**（合计约 4.3MB，单片 2–75KB），且是**可变字体**（`font-weight: 100 900`），
一份文件覆盖全部字重。浏览器只下载实际用到的分片。

不用思源黑体官方 OTF：OpenType/CFF 轮廓在 Windows DirectWrite 下小字号发虚、笔画扭曲。

### 顺带修掉的隐患

`text-section` 字阶原为 `fontWeight: 600`，但所有调用点都显式带 `font-bold`（700），
两者 CSS 优先级相同、谁生效取决于生成顺序，本来就脆。现统一为 700。

（注：Noto Sans SC 是可变字体，600 本可真实渲染；改成 700 是设计一致性选择。）

## 坑：Vite 会把小字体分片内联成 base64

Vite 默认 `assetsInlineLimit: 4096`，会把 4KB 以下的分片内联进 CSS。后果：

- 内联内容**无条件随 CSS 下载**，直接废掉 `unicode-range` 的按需加载；
- base64 比二进制大 33%。

三个壳的 `vite.config.ts` 增加：

```js
assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
```

修复后：101 个独立 woff2、0 内联，CSS 反而减小 12KB。

## 实测验证

「本地字体命中 → 不下载 web font」是本方案在 macOS 零下载的**唯一依据**，已用 headless
Chromium 实测。本机无 PingFang SC，故用系统已装的 `Noto Serif CJK SC` 扮演本地命中字体：

| 组 | 字体栈 | 是否下载 woff2 |
|---|---|---|
| A | `'LocalCJK', 'WebCJK'`（本地存在） | 否 |
| B | `'DefinitelyMissingFont', 'WebCJK'` | 是 |

结论：机制成立，非假设。

## 涉及文件

- `packages/ui/tailwind.preset.js` —— 字体栈；`section` 字重 600 → 700
- `packages/ui/src/styles/tokens.css` —— 顶部 `@import '@fontsource-variable/noto-sans-sc'`
- `packages/ui/package.json` —— 新依赖 `@fontsource-variable/noto-sans-sc`
- `packages/{frontend,desktop,mobile}/vite.config.ts` —— `assetsInlineLimit`

## 验证

- 三端 `build:vite`：各 101 个 woff2、0 个 base64 内联
- typecheck：ui / frontend / desktop / mobile 全过
- vitest：ui 497 全过
- eslint 全过
- 产物确认 `.text-section{font-size:13px;line-height:18px;font-weight:700}`

## 遗留

- **包体积**：101 分片共约 4.3MB 进入 desktop 产物与 Android APK。内含韩文 / 日文 /
  emoji 专用分片，对中文应用是死重量，如需可裁剪。
- **字体切换跳动**：`font-display: swap` 下启动瞬间先用雅黑渲染再切换。Tauri 本地加载
  应无感；若实测有可见跳动，补带 `size-adjust` 的 fallback `@font-face` 对齐 metrics。

## Comments

- 2026-10-01：实现完成。三端构建 / typecheck / 测试 / lint 全过；惰性加载机制经 headless
  Chromium 实测确认。
- 2026-10-01：Windows 观感验收通过（分组头、12px 小字、中英混排、中文标点）。
