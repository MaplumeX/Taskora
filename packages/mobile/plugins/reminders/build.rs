/// register_listener / remove_listener：原生事件（actions-available、open-task）
/// 经 addPluginListener 订阅，ACL 需显式放行。
const COMMANDS: &[&str] = &[
    "sync",
    "clear",
    "status",
    "request_permission",
    "open_settings",
    "take_pending_actions",
    "take_launch_task",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
