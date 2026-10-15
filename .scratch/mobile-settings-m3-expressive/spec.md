# 窄屏设置：Material 3 Expressive 分段列表

Status: implemented — awaiting device acceptance

在 `.scratch/mobile-settings-material/spec.md`（换掉 iOS 的图标、`›`、✓、顶栏）之后，窄屏设置的骨架仍是 iOS 的 inset grouped 列表，整体仍有「iPhone 设置」味。本次把列表骨架换成 Android 16 系统设置（Material 3 Expressive）的分段写法。导航栈、返回行为与桌面设置弹窗不变。

## Problem Statement

- 灰底 + 白色圆角卡片 + 卡片内行间分隔线：iOS inset grouped 的标志性外观。
- 当前值以灰字放在行尾（「外观 …… 浅色」）：iOS detail 样式；Android 写在标题下方。
- 开关关闭 / 打开时滑块等大、白色带阴影：iOS 开关的样子。
- 首页账户卡片的大头像 + 大字号名称，接近 Apple ID 栏。

## Solution

| 元素 | 之前 | 现在 |
|---|---|---|
| 分组 | 一张圆角卡片，行间分隔线 | 每行一块独立圆角块，行间 2px 空隙；首行上圆角 / 末行下圆角 24px，其余 4px；无分隔线 |
| 当前值（`SettingsRow.value`） | 行尾灰字 | 标题下方第二行灰字（summary） |
| 开关（窄屏） | 主题色 / 灰轨道，24px 白滑块带阴影 | 关闭：描边轨道 + 16px 灰滑块；打开：主题色轨道 + 24px 滑块；无阴影 |
| 首页账户行 | 48px 头像、18px 名称 | 40px 头像、16px 名称 |

分组小标题、footer 说明、单选圆点、顶栏、页面底色沿用上一版。

## Implementation Decisions

- 分段样式放在 `SettingsGroup` 的行容器上，用 `[&>*]` 作用于直接子元素：行本身或包裹层（如提醒可靠性的 `data-testid` 包裹 div）都能成块，各设置页无需改动。
- `SettingsGroup` 新增 `role`：`SettingsOptionGroup` 与时区列表把 `radiogroup` 放在行容器上，选项按钮因此是直接子元素、各自成块。
- 开关的 Material 3 尺寸 / 颜色全部在 `max-md:` 下，桌面保持 36×20 原样。

## Testing Decisions

- 既有设置测试（role / aria、导航栈、Escape）不变，全部通过。
- 390px 截图验收：首页、通用、外观、关于；亮 / 暗；开关开 / 关。

## Out of Scope

- 按下波纹（ripple）、开关按下时滑块放大。
- 把 footer 说明并入行内副标题。
- 主色（接近 iOS 系统蓝）调整：属全局 token。
