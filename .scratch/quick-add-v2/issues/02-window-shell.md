# 02：透明圆角窗口、动态高度、进出场动画

Status: implemented — awaiting desktop verification

## Problem

现在的浮窗是 520×120 的不透明直角窗口，投影不可见，高度也固定，放不下备注和弹出的选择器。

## Design

见 spec 第 1、5 节。

- `tauri.conf.json`：quick-add 窗口设 `transparent: true`，宽度可调到约 600。macOS 需要 `macOSPrivateApi`，并用 `window-vibrancy` 加毛玻璃；Windows / Linux 不加特效，用卡片自身的背景色。
- 卡片外围留出透明边距，用来显示投影。页面 `html` / `body` 背景设为透明。
- 动态高度：用 `ResizeObserver` 监听卡片高度，通过 `setSize` 同步窗口高度，保持顶边位置不动，不要每次重新居中。
- 弹出层（日期、Tag、归属选择器）：窗口高度要足够放下弹出层，或者打开选择器时临时把窗口加高、关闭后恢复。实现时选一种，验收时确认不会被裁切。
- 进出场：打开时淡入并轻微上移；提交或 Esc 时淡出后再 `hide()`。
- 需要实机检查 WSL / Linux AppImage 上透明窗口的表现。透明不生效时，退回不透明的圆角卡片。

## Acceptance

- macOS、Windows 上看到的是悬浮的圆角卡片和投影，没有矩形的窗口底色。
- 展开备注、增加 chip 时窗口跟着长高，位置不跳。
- 所有选择器都能完整显示。

## Comments

### 2026-10-02：实现

- 决策（用户确认）：
  - 毛玻璃先不做，不引入 `window-vibrancy`；
  - 弹出框用「窗口固定高、卡片下方留透明区域」的方案，不做「打开选择器时临时加高窗口」；
  - **打开 `macOSPrivateApi`**：macOS 上即使不做毛玻璃，Tauri 窗口要透明也必须打开它。代价是不能上架 Mac App Store，目前只发 dmg，可以接受。
- `tauri.conf.json`：`app.macOSPrivateApi: true`；quick-add 窗口改为 600×640，`transparent: true`，`shadow: false`（否则 Windows 会在透明窗口外画一圈边框和阴影）。`Cargo.toml` 的 tauri 依赖加 `macos-private-api` feature（tauri-build 会校验 feature 与配置一致）。
- 页面：quick-add 分支给 `<html>` 加 `quick-add-window` class，`index.css` 把 html / body / #root 设为透明。只有卡片有底色和投影，卡片四周留 16px 给投影。
- 布局：卡片贴窗口顶部，下方约 450px 透明区域留给日期选择器等弹出框。窗口高度固定，不需要随内容调整，原计划的 ResizeObserver 不做了。
- 点透明区域等同点到窗外：隐藏窗口但保留草稿，与失焦隐藏同一语义；有选择器开着时，只关闭选择器。
- 进出场动画用 Web Animations API，挂在卡片外层：进场淡入并下落 8px（150ms），出场淡出（100ms）后再 `hide()`。没有用「换 key 重挂」来重播动画，因为重挂会丢草稿。`prefers-reduced-motion` 时不播放动画。失焦隐藏由原生处理，没有出场动画。
- 验证：desktop 包的 tsc / eslint / vitest 通过；`cargo check`（Linux）通过。
- **未验证（需要实机）**：
  - 三个平台上窗口是否真的透明（Linux 需要合成器，否则退回不透明）；
  - 日期选择器在 640 高的窗口内能否完整显示；
  - 透明区域会挡住它后面窗口的点击，这是方案 (a) 已知的代价。
