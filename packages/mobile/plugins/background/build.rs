// move_to_back：根页返回手势的收尾动作（android-app issue 08）。
const COMMANDS: &[&str] = &["move_to_back"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
