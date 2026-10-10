# 03 非立即模式下的完成节奏

Status: implemented
Blocked by: 02

## Problem

`useCompletionRhythm` 固定为「停留 600ms → 收起 → 提交」。非立即模式下行不会离开，收起动画和撤销窗都多余。

## Design

见 spec 第 3 节。

- 非立即模式：勾选立即提交，播放勾号笔画动画，不收起；再点就是重开。
- 键盘完成路径不变（本来就不停留）。
- 项目进度饼的 preview 在立即提交时不需要。

## Acceptance

- 手动 / 每天模式下勾选后马上写入完成，行留在原位并变为删除线；再点重开。
- 立即模式的现有节奏与测试不变。
- `useCompletionRhythm.test.ts` 补非立即模式的用例。

## Comments

### 2026-10-10 — 实现

- `useCompletionRhythm` 读 `useLoggingMode()`：非立即模式与 reduced-motion 同路径，立即提交、不停留、不收起、不预览进度。
- 测试：`useCompletionRhythm.test.ts` 新增 DAILY / MANUAL 用例。
