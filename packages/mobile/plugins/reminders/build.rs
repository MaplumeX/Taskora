const COMMANDS: &[&str] = &["sync", "clear", "status", "request_permission", "open_settings"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
