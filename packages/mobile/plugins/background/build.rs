// move_to_back：根页返回手势的收尾动作（android-app issue 08）。
// safe_area_insets：系统栏安全区（WindowInsets 兜底 env()）。
// set_system_bar_appearance：系统栏图标明暗跟随 App 主题。
// system_theme：读取 Android 系统主题（uiMode）。
// register_listener / remove_listener：JS `addPluginListener` 订阅 `insets` / `theme`
// 事件的内建命令，不列出就不生成权限，订阅会被 ACL 拒绝（同 statusbar）。
const COMMANDS: &[&str] = &[
    "move_to_back",
    "safe_area_insets",
    "set_system_bar_appearance",
    "system_theme",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
