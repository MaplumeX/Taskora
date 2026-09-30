# 05 移动端下拉唤起

Status: implemented — awaiting Android device acceptance
Blocked by: 02

## Problem

Things 3 在 iPhone 上下拉列表即可打开 Quick Find，Taskora 移动端只能点顶栏按钮。

## Design

见 spec 第 6 节。要点：

- 可复用的 `usePullToFind` hook，挂在列表页的滚动容器上：`scrollTop === 0` 时继续下拉超过约 64px 松手触发，下拉过程中顶部露出搜索图标。
- 只在 Bucket 视图、Project、Area、Tag 页生效。
- 与长按拖动（300ms）、左滑多选、原生回弹不冲突。

## Acceptance

- 列表在顶部时下拉松手打开 Quick Find；未超过阈值松手不触发。
- 列表不在顶部时下拉只是正常滚动。
- Android 真机验收：长按拖动、左滑多选、滚动回弹不受影响。若无法做到，降级为只保留顶栏按钮，并在 Comments 中记录。

## Comments

### 2026-09-30 — 实现

- `usePullToFind(scrollRef, onPull, options)`（`packages/ui/src/lib/usePullToFind.ts`）挂在 `MainContent` 的 `<main>` 滚动容器上，不需要每个列表页各挂一次。
  - 用 touch 事件而不是 pointer 事件：任务行是 `touch-action: pan-y`，纵向平移一开始浏览器就发 pointercancel，而 touch 事件会持续派发。监听器是 passive 的，不阻止原生滚动和回弹。
  - 判定：单指；按下时和越过 8px 判定时 `scrollTop` 都为 0；主方向向下；在按下后 250ms 内开始移动（与左滑同口径，和长按拖拽的 300ms 互斥）。不满足的手势整次放弃。
  - 跟手：指示器露出手指移动距离的一半，上限 96px；露出 ≥ 64px 时松手触发。松手后指示器立即收回（没有回弹动画）。
- 指示器：`<main>` 顶部一条高度跟随手势的空白，中间是搜索图标，越过阈值后变为主题色，把内容整体往下推。
- 生效范围：`isPullToFindRoute`，覆盖 Bucket 视图、稍后项目、废纸篓、标签页、项目 / 区域 / 单个标签页，并额外加入了手机首页 `/home`（Things 3 iPhone 在首页下拉也会打开 Quick Find，spec 没列）。日历和助手页不生效；多选模式中也不生效。
- 打开：`openSearch()`，由 `ContentBottomBar` 里的 Quick Find 实例响应。它的 footer 在窄屏隐藏，但 Quick Find 渲染在 footer 之外，窄屏同样可用。
- 测试：
  - hook：跟手与阈值、上限、不在顶部、先横向或向上、长按后才移动、多指、禁用；
  - `MainContent`：列表页下拉打开、指示器出现与收回、日历页不生效、多选模式不生效、路由判定。
- 验证：全部包 typecheck 通过，eslint 通过。ui 401、desktop 51、mobile 72 个测试通过（desktop 和 mobile 的 `MainApp` 测试会引入 `MainContent`，用来确认两端的 import 路径能解析）。
- 未做：Android 真机验收。需要确认长按拖动、左滑多选、滚动、到顶时的 overscroll 效果都不受影响。若有冲突，按 spec 降级为只保留顶栏按钮：去掉 `MainContent` 里的 `usePullToFind` 即可。
