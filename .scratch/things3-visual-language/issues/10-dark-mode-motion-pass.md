# 10: 暗色模式与动效终验

Status: open
Blocked by: 09

## 内容

1. 暗色模式整体对比度与层次调校（侧边栏 / 内容 / 卡片 / 弹层四层可区分，正文 ≥ 4.5:1，元信息 ≥ 3:1）。
2. 动效统一：检查所有 transition 使用 `--ease-spring` 与时长变量；reduced-motion 全局降级。
3. Android 真机与 Windows 桌面各跑一遍关键路径。

## 验收标准

- [ ] 对比度抽检记录在 Comments
- [ ] reduced-motion 开启时无位移 / 缩放动画
- [ ] 真机验收通过

## Comments
