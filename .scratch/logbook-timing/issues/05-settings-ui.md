# 05 设置界面：「完成的条目移入 Logbook」

Status: implemented
Blocked by: 01

## Design

见 spec 第 5 节。设置 → 通用加分段控件「立即 / 每天 / 手动」，下方一行灰字说明当前选项（手动时提示 `⇧⌘Y`，按用户的自定义键位显示）。调用 `setLoggingMode`。中英文案。

## Acceptance

- 切换后各端视图按新模式刷新；切到手动时，此前已了结的条目不回到原视图。
- Web、桌面、Android 都能设置。

## Comments

### 2026-10-10 — 实现

- 设置 → 通用：宽屏为三个分段按钮（与外观页主题选择同一组件，`OptionButton` 移到 `SettingsList`），窄屏为 ✓ 选项组；灰字说明随模式变化，手动模式在有键位时带上当前生效的键位。
- 失败时回滚并提示保存失败。
