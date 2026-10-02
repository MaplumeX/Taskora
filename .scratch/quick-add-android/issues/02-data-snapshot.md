# 02：数据快照（web → 原生）

Status: implemented — awaiting device verification (Kotlin not compiled)

## Problem

原生浮层没有 Projects、Areas、Tags 数据，也不知道账号时区，所以无法提供选择器，也算不对「今天」。

## Design

见 spec 第 3 节。

- 新增插件命令 `setQuickAddData`（Kotlin、Rust `lib.rs` 的命令注册、capabilities 权限都要加），把 JSON 原样写进 SharedPreferences。
- JS 侧新增 `buildQuickAddSnapshot()`：
  - 归属列表按 `MovePicker` 同一套逻辑（`buildMoveTargets`）排好序，排除稍后项目；
  - 输出为扁平的行列表，每行带 `depth`，原生端直接渲染，不再推导；
  - Tag 按 Tag Group 分组输出；
  - 文案一并写入。
- 推送时机：状态栏发布时，以及 `scheduleStatusBarRefresh` 的防抖回调里。内容没变（比较哈希）时不写。
- 状态栏开关关闭时不推送；`cancel` 时随 SharedPreferences 一起清除，现有行为已经如此。

## Acceptance

- 在 App 内新建一个项目，几秒后打开浮层，归属列表里就有这个项目。
- 账号时区与设备时区不同时，「今天」按账号时区计算。
- 测试：`buildQuickAddSnapshot` 单测，覆盖排序、Later 过滤、Tag 分组。

## Comments

### 2026-10-02：实现

- JS：新文件 `mobile/src/status-bar/quick-add-snapshot.ts`。
  - `buildQuickAddSnapshot` 是纯函数：归属行用 `buildMoveTargets`，去掉稍后项目，按 `nested` 得到 `depth`；Tag 行用 `buildTagPickerRows`（不传搜索词时自带分组）；再加上账号时区、`weekStartsOn`、全部文案（`quickAddTexts`）。快照带版本号 `v: 1`。
  - `syncQuickAddData` 从当前数据源读取数据，调用 `plugin:statusbar|set_quick_add_data`。
- 推送时机：状态栏控制器新增可选的 `syncQuickAddData` 选项，在 `refreshNow` 每次发布通知后调用（开关开启、登录、数据变更的防抖刷新），失败只记日志。原计划「比较哈希后再写」改成**原生侧比较**：内容没变就不写盘。JS 侧不缓存，因为 `cancel` 会清空 SharedPreferences，JS 缓存会和原生实际内容不一致。
- 原生：新增命令 `setQuickAddData`（Kotlin、Rust、build.rs、default.toml），写入 `QUICK_ADD_DATA_KEY`；关闭开关或登出时随 `cancel` 一起清除。
- 测试：`quick-add-snapshot.test.ts`（3 条，排序与侧边栏一致：区域在前、无区域项目在后），`controller.test.ts` 新增同步时机一条。
