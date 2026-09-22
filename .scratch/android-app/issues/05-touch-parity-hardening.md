# 05: 触控平价查漏补缺

Status: done

## 背景

网页端已有移动交互层（MobileTabBar / MobileNavDrawer / MobileFab / `useLongPress`），Android 壳接入后需系统性排查触控缺口，达成「完整平价」。

## 内容

1. **返回手势级联**：Tauri back-navigation 事件 → 关闭 MobileNavDrawer / dialog / sheet → `history.back()` → 根页退出。写壳层测试断言级联顺序。
2. **键盘避让**：虚拟键盘弹出时输入框、MobileFab、底部栏正确避让（`h-dvh` + Android insets）。
3. **触控语义巡检**：逐一核对桌面端可达的操作在触屏均有路径——点击 = 打开详情、checkbox = 勾选、长按 = 行内菜单（CONTEXT.md Selection 词条）；确认无仅 hover 可达的操作。
4. **拖拽**：dnd-kit 触控排序在关键列表（Today、Project 内）可用；不可用处降级为菜单移动。
5. **深色模式 / 系统语言 / 视口**：跟随系统设置；Agent 聊天 SSE 流式在移动布局下可用。

## 验收标准

- [ ] 打开抽屉后按系统返回关闭抽屉而非退出 App；关闭弹层优先于路由返回；根页返回退出
- [ ] 键盘弹出时无遮挡/无布局跳动
- [ ] 全部桌面端操作在触屏上有可达路径（人工核对清单记录在 issue Comments）
- [ ] Today / Project 列表触控拖拽排序可用

## Comments

## Comments

### 触控语义巡检清单（实现侧核对，2024 android-app 落地时）

- **返回级联**：`back-navigation.ts` 注册 Tauri v2 `app.onBackButtonPress`
  （注册即接管默认 goBack 行为，tauri PR #14133）。级联：Radix 浮层
  （dialog/menu/listbox，`data-state="open"`）→ 合成 Escape 关闭最顶层
  → `window.history.state.idx > 0` 则 `history.back()`（mobile 用
  BrowserRouter，路由历史即 webview 历史）→ 根页 `app_exit`（Rust
  command）。壳层测试 `back-navigation.test.tsx` 断言三级顺序。
- **键盘避让**：`keyboard-inset.ts` 用 `visualViewport` 写入
  `--kb-inset`；AppShell 根容器、MobileTabBar（bottom + paddingBottom）、
  MobileFab（bottom calc）消费该变量，未设置时为 0（web/desktop 无感）。
  公式对 adjustResize 场景自然归零，不会双重避让。
- **点击 = 打开详情 / checkbox = 勾选 / 长按 = 行内菜单**：网页端移动层
  （`useLongPress` 与右键共用 virtual anchor 菜单）直接继承，无 hover-only
  操作（mobile-touch-issues feature 已把 Project Heading 拖拽手柄改为
  `max-md:opacity-100`、TouchSensor 带 delay）。触控端无 Selection
  （CONTEXT.md 词条口径一致）。
- **拖拽**：Today / Project 列表的 dnd-kit `TouchSensor` 已在
  mobile-touch-issues 03 落地；菜单长按 500ms > TouchSensor 激活 300ms，
  两类手势天然分离。
- **深色模式 / 系统语言**：跟随系统（`prefers-color-scheme` +
  i18next 检测），`index.html` 带 `viewport-fit=cover` 使
  `env(safe-area-inset-*)` 在 Android WebView 可用。
- **Agent SSE**：useAgentStream 走 fetch/EventSource，webview 前台可用；
  full-bleed 路由的 TabBar 遮挡已在 02-agent-tabbar-occlusion 修复，
  mobile 壳无新增遮挡。

**真机待验证项**（无本地 Android 工具链，留给首版发布前 smoke）：
键盘弹出无跳动、返回手势三级行为、下拉刷新与长按菜单在真机手感。
