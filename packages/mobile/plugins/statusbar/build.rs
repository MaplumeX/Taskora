// `register_listener`/`remove_listener` 是 Tauri 移动端 Plugin 基类的内建
// 命令（JS `addPluginListener` 的首选调用名，snake_case），不在 COMMANDS 里
// 列出就不会生成对应权限，订阅会被 ACL 拒绝（fallback 到 camelCase 同样被
// 拒），`trigger` 便没有监听者可投递。
const COMMANDS: &[&str] = &[
    "show",
    "cancel",
    "take_navigation",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
