# 10: 暗色模式与动效终验

Status: done — awaiting device acceptance
Blocked by: 09

## 内容

1. 暗色模式整体对比度与层次调校（侧边栏 / 内容 / 卡片 / 弹层四层可区分，正文 ≥ 4.5:1，元信息 ≥ 3:1）。
2. 动效统一：检查所有 transition 使用 `--ease-spring` 与时长变量；reduced-motion 全局降级。
3. Android 真机与 Windows 桌面各跑一遍关键路径。

## 验收标准

- [x] 对比度抽检记录在 Comments
- [x] reduced-motion 开启时无位移 / 缩放动画
- [ ] 真机验收通过

## Comments

- 2026-09-27：对比度（脚本按 token 计算 WCAG 比值）。调整：亮色 primary 52→48%、muted-foreground 46→42%、deadline / destructive 56→48%、warning → `36 90% 40%`、nav-inbox / anytime / someday 调深；暗色 primary 62→53%、deadline / destructive 62→66%、selection 28→22%。调整后：
  - 文字类全部 ≥ 4.5:1（正文 15.3 / 13.5；muted 在底 / 侧边栏 / 卡片 / 选中行上 4.7–5.5）。
  - 图标类 ≥ 3:1，例外：黄色 Today 星（白底 1.75，实心形状 + 旁侧文案承担语义）。
  - 保留的取舍：暗色主按钮白字 / 蓝底 3.99（再压暗蓝色会让暗色下的蓝色链接 / 图标低于 4:1）；亮色 card / popover 与底同为白色（靠阴影区分，Things 同款）。
- 动效：剩余的 `duration-200` 改为 `duration-base`；preset 设 `transitionDuration.DEFAULT = var(--dur-fast)`，未显式指定时长的 `transition-*` 统一 120ms。
- reduced-motion（Playwright `reducedMotion: 'reduce'`）：展开 / 行过渡计算时长 1ms；勾选完成 120ms 内行即移除（无 600ms 停留）。
- 待办：Android 真机与 Windows 桌面关键路径验收（需用户在设备上进行）。
