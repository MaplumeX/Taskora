# 窄屏设置：两级推进导航 + 列表单元格

Status: implemented — awaiting device acceptance

窄屏（< md，含 Android 与手机网页）的设置改为移动端惯用结构（iOS 设置 / Android 系统设置 / Things iOS）：分类首页列表 → 推入详情页，详情页用分组列表单元格而非桌面表单。宽屏居中弹窗 + 左侧导航不变。相关：`.scratch/android-app/spec.md`（窄屏导航）、`.scratch/mobile-field-dialogs/spec.md`。

## Problem Statement

- 窄屏设置是全屏页，但分类导航是一排横向滚动标签，分类多时需要横滑寻找，选中态不醒目。
- 内容页是桌面表单：标签在上、控件在下、每项一段说明；时区是整行原生下拉，主题 / 语言是一排小按钮。
- 系统返回手势直接关闭整个设置，没有「返回上一级」。
- 首页底部并列「设置」与「登出」，登出这种低频危险操作放在主导航枢纽里不合惯例。

## Solution

- **首页（根）**：顶栏标题「设置」+ 右侧「完成」。顶部账户卡片（头像 + 名称 + 邮箱）进入账户页；下方分组列表：通用、外观（右侧显示当前主题）｜助手（已配置 / 未配置）、数据｜关于（版本号）。每行彩色圆角图标 + 名称 + 当前值 + `›`。
- **详情页**：从右侧推入，顶栏左「‹ 设置」、居中标题。内容为分组圆角列表：
  - 开关直接放在行内；
  - 少量选项（主题 / 语言 / 每周起始日 / 思考模式）为行内 ✓ 选项组；
  - 选项多（时区、助手服务商）显示当前值 + `›`，推入带 ✓ 的选项列表页（时区带搜索框）；
  - 文本输入为「标签在上、输入框在下」的单元格；
  - 说明文字作为分组下方的小号灰字（footer）。
- **账户页**：个人资料、修改密码两组（各带保存按钮行），底部「退出登录」与「删除账户」红字行。首页移除登出按钮。
- **返回**：系统返回 / Escape 在详情或选项页时逐级后退，在根页才关闭设置。

## User Stories

1. As a Taskora 手机用户, I want 设置首页是分类列表并显示各项当前值, so that 不点进去也知道当前配置
2. As a Taskora 手机用户, I want 点分类推入详情页、左上角返回, so that 层级清楚
3. As a Taskora 手机用户, I want 系统返回手势先回上一级、在首页才关闭设置, so that 符合 Android 导航语义
4. As a Taskora 手机用户, I want 开关放在行内、选项用 ✓ 列表, so that 单手即可操作
5. As a Taskora 手机用户, I want 在带搜索的列表里选时区, so that 不用在几百项的下拉里滚动
6. As a Taskora 手机用户, I want 在账户页退出登录, so that 登出位于惯常位置、首页更干净
7. As a Taskora 桌面用户, I want 设置弹窗保持原样, so that 桌面习惯不变

## Implementation Decisions

- **导航栈**：`SettingsModal` 窄屏分支持有页面栈（根 → 分类 → 选项页），通过 `SettingsNavContext` 向设置页暴露 `push({ title, render })` / `pop()`；选项页以 render 函数描述，渲染时读取实时 store，避免闭包过期。
- **页面双形态**：设置页通过 `useSettingsNav()` 判断是否处于窄屏栈内，是则渲染列表单元格形态，否则保持桌面表单（既有桌面测试不变）。
- **列表基础组件**（`SettingsList.tsx`）：`SettingsGroup`（header / footer）、`SettingsRow`（图标、值、`›`、行内控件、destructive）、`SettingsInputRow`、`SettingsOptionGroup`（✓ 选项组）。
- **入口**：`openSettings(tab?)` 显式传入分类时（如助手页「去配置」）窄屏直接推入该分类；不传则停在根页。桌面默认分类仍为外观。
- **返回手势**：DialogContent 的 `onEscapeKeyDown` 在栈深 > 1 时阻止关闭并出栈；Android back-navigation 已把返回键转为 Escape。
- **推入动画**：新页面 `slide-in-from-right` + fade，出栈不做动画。

## Testing Decisions

- `SettingsModal` 窄屏：根页列出各分类；点击推入对应页面并显示「返回」；返回 / Escape 回到根页而不关闭；根页 Escape 关闭；`openSettings('assistant')` 直接落在助手页。
- 选项页：外观页选中主题后 ✓ 移动；时区选项页搜索过滤。
- 既有桌面形态的设置页测试继续通过。

## Out of Scope

- 桌面设置弹窗改版。
- 头像上传（仍为 URL 输入）。
