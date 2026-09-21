# 02 — /agent composer occluded by MobileTabBar

Status: done

## Problem

`MobileTabBar` 无条件 `fixed bottom-0 md:hidden` 渲染（不像 `MobileTopBar` / `ContentBottomBar` 对 `/agent` 特判）。`/agent` 是 full-bleed 路由（`MainContent` 内层 `h-full` 无底部留白），移动端 composer 被标签栏盖住。`/calendar`（canvas 路由）同样 `h-full` 无底部留白，月网格最后一行被标签栏遮挡。

## Fix

`MainContent` 的 full-bleed 与 canvas 容器加 `max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]`（3.5rem = MobileTabBar 内容高度），保持全局导航可达（不隐藏 TabBar）。
