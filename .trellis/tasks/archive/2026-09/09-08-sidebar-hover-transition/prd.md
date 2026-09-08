# fix(frontend): sidebar hover transition feels laggy

## Goal

侧边栏条目 hover 高亮存在 150ms 渢入渐出，鼠标快速滑动时高亮"追不上"光标，体感不跟手。改为 hover 进入即时高亮、离开时 150ms 淡出（Things3 风格），保持视觉柔和的同时消除滞后感。

## Background（研究结论）

- 所有侧边栏条目 className 均带 Tailwind `transition-colors`（默认 150ms），hover 进入和退出都在做渐变，这是滞后的唯一根因。
- 涉及位置：
  - `packages/frontend/src/components/layout/Sidebar.tsx:43`（NavRow 主导航）
  - `packages/frontend/src/components/layout/Sidebar.tsx:79`（CollapsibleSection 标题，Tags 区）
  - `packages/frontend/src/components/layout/Sidebar.tsx:109`（Tag 子条目）
  - `packages/frontend/src/components/layout/SidebarAreaRow.tsx:59`（区域条目）
  - `packages/frontend/src/components/project/ProjectItem.tsx:42`（项目条目）
- dnd-kit 的 transform transition 仅在拖拽时生效，与 hover 无关，不在本任务范围。

## Requirements

1. hover 高亮进入必须即时（无渐入延迟/渐入动画）。
2. 鼠标离开后高亮以约 150ms 渐出，避免生硬闪烁。
3. 实现方式统一：优先在 `index.css` 增加 utility class（如 `.hover-instant`：常态 `transition: background-color 150ms, color 150ms`，`:hover` 时 `transition: none`），5 处 className 复用，不要散落 5 份重复样式。
4. 不改变 hover 时的颜色值（仍是 `hover:bg-accent/60` / `hover:bg-accent`、`hover:text-accent-foreground`）。
5. 不影响激活态（`isActive`）样式、拖拽行为与键盘 focus 行为。
6. 尊重 `prefers-reduced-motion`（若 utility 内使用 transition，reduced-motion 下同样适用；可用现有机制，不额外复杂化）。

## Acceptance Criteria

- [ ] 侧边栏 5 处条目（主导航、Tags 区标题、Tag 子条目、区域条目、项目条目）hover 进入即时高亮。
- [ ] 移开后高亮 ~150ms 淡出，无生硬闪变。
- [ ] 现有测试全部通过（`SidebarProjectSection.test.tsx` 中关于 5px 激活阈值、measuring 的断言不受影响）。
- [ ] `pnpm lint` / `pnpm test`（frontend 范围）通过。
- [ ] 桌面端手动验证：快速滑动侧边栏，高亮紧跟光标。

## Out of Scope

- 拖拽排序动画调整
- `backdrop-blur` / 噪点层性能优化
- 移动端抽屉导航的交互调整
