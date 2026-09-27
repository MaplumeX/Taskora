# 窄屏设置：Material（Android）写法

Status: implemented — awaiting device acceptance

窄屏设置（`.scratch/mobile-settings/spec.md` 的两级推进导航）保留结构与行为，把 iOS 设置的视觉 / 交互习惯换成 Android 系统设置（Material 3）的写法。原生手机端只有 Android；窄屏网页的 iPhone 用户看 Material 写法同样自然，因此不按平台分叉。相关：`.scratch/things3-visual-language/spec.md`（整体视觉语言）。

## Problem Statement

窄屏设置照搬了 iOS 设置：彩色圆角方块图标、居中标题 + 「‹ 上一级」文字返回、首页右上角「完成」、行尾 `›` 与 ✓、居中红字危险行、13 / 15 / 17px 的 iOS 字号、绿色开关。Android 用户会拿它和系统设置对比，一眼看出是「iPhone 设置」。

## Solution

| 元素 | 之前（iOS） | 现在（Material） |
|---|---|---|
| 顶栏 | 居中标题、左「‹ 上一级名称」、首页右「完成」 | 左 ← 图标按钮（首页即关闭设置）+ 靠左 20px 标题，无「完成」 |
| 分类图标 | 彩色圆角方块白图标 | 24px 单色线性图标（次要文字色） |
| 可进入的行 | 行尾 `›` | 无 `›`（整行可点） |
| 选项 | 行尾 ✓ | 行首单选圆点（`SettingsRadio`） |
| 分组小标题 | 13px 灰字 | 14px 主题色 |
| 字号 / 行高 | 15px 正文、48px 行 | 16px 正文、56px 行 |
| 危险 / 主操作行 | 居中 | 靠左（危险红字、主操作主题色） |
| 开关 | 绿色、36×20 | 主题色；窄屏 52×32 轨道、24px 滑块 |
| 时区搜索框 | 圆角矩形 | 胶囊形 48px |
| 页面底色（暗色） | `muted`（比卡片亮，层次颠倒） | `background`（卡片更亮一层） |

分组仍为圆角卡片（`rounded-2xl`）：Android 12+ 系统设置同样使用分组容器。

## Implementation Decisions

- 改动集中在 `SettingsList.tsx`（基础组件）与 `MobileSettings.tsx`（顶栏、首页），各设置页只去掉 `chevron` 属性；时区列表改用 `SettingsRadio`。
- `SettingsRow` 删除 `chevron` 属性与居中逻辑；`SettingsIcon` 不再接收颜色类（顺带消除 Tailwind 色板类名例外）。
- 开关颜色改为主题色是全局改动（桌面同步）；窄屏尺寸通过 `max-md:` 放大，桌面保持 36×20。
- 导航栈、返回手势、选项页 render 函数等行为不变；按钮无障碍名称不变（子页返回仍为「Back」，首页 ← 为「Close」）。

## Testing Decisions

- 既有测试（role=radio / aria-checked、Back 按钮、Escape 逐级后退）全部沿用，无需修改。
- Playwright 390px 截图验收：首页、外观、通用、账户，亮 / 暗。

## Out of Scope

- 桌面设置弹窗。
- 账户页「保存」改为实心按钮、按下波纹（ripple）效果。
- 按平台（Android / iOS 网页）分叉样式。
