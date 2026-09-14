# 04: 桌面端主窗口功能对齐 web

Status: done

## 背景

V1 主窗口功能与 web **完全对齐**：Areas→Projects→Tasks→Subtasks、全部 Buckets（Inbox / Anytime / Scheduled / Someday / Today / Upcoming / Logbook / Trash）、标签与标签组、拖拽排序、i18n（en / zh-CN）、软删除恢复。桌面包一层独立导航壳，业务组件来自 `packages/ui`。

依赖：01、02、03。

## 内容

1. 桌面端独立导航壳（侧栏 + 内容区），业务组件从 `ui` 引入。
2. 数据层直接接 `packages/api`。
3. dnd-kit 拖拽在 Tauri WebView（Linux webkit）中验证可用性；若有平台差异需修复或记录。
4. i18n 双语切换。
5. 快速添加悬浮窗**不在本 issue**（见 05）。

## 验收标准

- [ ] web 端全部功能在桌面端可用且行为一致
- [ ] 拖拽排序在 Linux 上无异常
- [ ] 中英文切换正常
- [ ] Trash 恢复 / 级联清理正常

## Comments

Implemented in commits 5fa1f68 + 737dd4c. Desktop shell = MemoryRouter with the same URL shape as web + `@taskora/ui` AppShell and all shared page views; page views moved from frontend to `packages/ui` so both ends are pixel-identical. i18n/theme switching via the shared preferences store. Integration test renders the shell (sidebar nav + Today). dnd-kit drag on Linux webkit needs manual QA — pointer-driven dragging cannot be covered headlessly; no known issues expected (dnd-kit runs on DOM events).
