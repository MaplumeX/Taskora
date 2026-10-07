//! 系统级 Quick Add 快捷键（ADR-0017）：用户可在「设置 → 快捷键」改绑。
//!
//! 键位（Tauri accelerator，如 `CmdOrCtrl+Shift+Space`）持久化到 app data
//! 目录，启动时读出并注册。改绑先注册新键位，成功后再注销旧键位：新键位
//! 被其他应用占用时注册失败，原键位保持可用，错误交给设置页提示。

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// 默认键位。Plain Cmd/Ctrl+Space 不可用：Windows 上 Ctrl+Space 是输入法
/// 切换键，macOS 上 ⌘Space 是 Spotlight（见 ADR-0004）。
pub const DEFAULT_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";

const SHORTCUT_FILE: &str = "quick-add-shortcut.json";

/// 当前已注册的键位（accelerator 原文，供设置页与托盘菜单展示）。
#[derive(Default)]
pub struct QuickAddShortcut(Mutex<String>);

fn shortcut_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SHORTCUT_FILE))
        .map_err(|e| e.to_string())
}

fn read_stored<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let raw = fs::read_to_string(shortcut_path(app).ok()?).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_stored<R: Runtime>(app: &AppHandle<R>, shortcut: Option<&str>) -> Result<(), String> {
    let path = shortcut_path(app)?;
    let Some(shortcut) = shortcut else {
        // 恢复默认：删掉记录，以后默认值变化时跟着变。
        return match fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    };
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(shortcut).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// 启动时注册：用户键位无效或注册失败（被其他应用占用）时退回默认键位。
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    let shortcuts = app.global_shortcut();
    let stored = read_stored(app).filter(|s| s.parse::<Shortcut>().is_ok());
    let mut registered = String::new();
    for candidate in stored.iter().map(String::as_str).chain([DEFAULT_SHORTCUT]) {
        match shortcuts.register(candidate) {
            Ok(()) => {
                registered = candidate.to_string();
                break;
            }
            Err(e) => eprintln!("failed to register quick-add shortcut {candidate}: {e}"),
        }
    }
    *app.state::<QuickAddShortcut>().0.lock().unwrap() = registered;
}

/// 当前生效的键位；空字符串表示注册失败、没有可用的系统级快捷键。
#[tauri::command]
pub fn quick_add_shortcut_get(state: State<QuickAddShortcut>) -> String {
    state.0.lock().unwrap().clone()
}

/// 改绑；`shortcut` 为 None 时恢复默认。返回改绑后生效的键位。
#[tauri::command]
pub fn quick_add_shortcut_set(
    app: AppHandle,
    state: State<QuickAddShortcut>,
    shortcut: Option<String>,
) -> Result<String, String> {
    let next = shortcut.as_deref().unwrap_or(DEFAULT_SHORTCUT).to_string();
    let parsed: Shortcut = next.parse().map_err(|e| format!("invalid shortcut {next}: {e}"))?;
    let mut current = state.0.lock().unwrap();
    let previous = current.parse::<Shortcut>().ok();
    if previous != Some(parsed) {
        let shortcuts = app.global_shortcut();
        shortcuts.register(parsed).map_err(|e| e.to_string())?;
        if let Some(previous) = previous {
            let _ = shortcuts.unregister(previous);
        }
    }
    *current = next.clone();
    write_stored(&app, shortcut.as_deref())?;
    Ok(next)
}
