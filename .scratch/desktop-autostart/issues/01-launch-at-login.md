# Desktop: 开机自启动选项

Status: resolved

## 背景

`.scratch/desktop-v1/spec.md` 将「托盘常驻、开机自启」列为 V1.x 待做项。托盘常驻（close-to-tray + Quit 入口）已上线，但设置里没有任何开机自启入口，用户无法开启。

## 方案

采用官方 `tauri-plugin-autostart`（三平台：macOS LaunchAgent / Windows 注册表 / Linux XDG autostart）：

- Rust（`src-tauri/src/lib.rs`）：注册插件，启动参数 `--hidden`；setup 中检测到 `--hidden` 时隐藏主窗口（开机启动只常驻托盘，不弹窗打扰；手动启动行为不变）。
- 权限：`capabilities/default.json` 增加 `autostart:default`。
- UI（`@taskora/ui`）：设置新增「通用 / General」标签页（`SettingsTab` 增加 `'general'`），仅在 Tauri 运行时（`__TAURI_INTERNALS__` in globalThis）显示入口；Web 版不渲染，`SettingsGeneral` 通过动态 `import('@tauri-apps/plugin-autostart')` 保证该模块不进 Web bundle。
- 开关直接操作系统登录项状态（`isEnabled`/`enable`/`disable`），无额外持久化——系统即事实来源。

## 涉及文件

- `packages/desktop/src-tauri/Cargo.toml`、`src/lib.rs`、`capabilities/default.json`
- `packages/ui/src/components/settings/SettingsGeneral.tsx`（新增）、`SettingsModal.tsx`
- `packages/api/src/stores/uiInteraction.store.ts`（SettingsTab）
- `packages/api/src/i18n/locales/{zh,en}/settings.json`
- `packages/ui/package.json`、`packages/desktop/package.json`（`@tauri-apps/plugin-autostart`）

## 验证

- `cargo check` 通过
- `@taskora/{api,ui,desktop,frontend}` typecheck 通过
- vitest：api 175 / ui 224 / desktop 38 全过；eslint 全过

## Comments
