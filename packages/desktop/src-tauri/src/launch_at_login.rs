//! 开机自启（.scratch/desktop-autostart/issues/02）：在系统登录项之外
//! 持久化用户意图，并在每次启动时与系统状态对账。
//!
//! 仅以系统登录项为事实来源不够：没有接入 updater 时用户手动运行新版
//! 安装包，NSIS 会先以非 `/UPDATE` 模式执行旧卸载程序，而它会删除
//! `HKCU\...\CurrentVersion\Run` 里的自启项 —— 每次升级自启都被悄悄关掉。

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;

const INTENT_FILE: &str = "launch-at-login.json";

#[derive(Debug, PartialEq)]
enum Reconcile {
    /// 无意图记录或意图为关：以系统现状为准记下意图（老用户迁移、
    /// 用户在系统设置里重新启用都走这里）。
    AdoptSystem(bool),
    /// 意图开且系统已开：重写登录项，刷新可执行文件路径（AppImage
    /// 换文件名、Windows 换安装目录后旧路径会失效）。
    Refresh,
    /// 意图开但登录项丢失（被安装包删除）：补回。
    Restore,
    /// 意图开但用户在系统里禁用了（Windows 任务管理器「启动应用」）：
    /// 尊重系统选择，意图改为关，不强行恢复。
    Yield,
}

fn plan(intent: Option<bool>, system_enabled: bool, disabled_in_os: bool) -> Reconcile {
    match intent {
        Some(true) if system_enabled => Reconcile::Refresh,
        Some(true) if disabled_in_os => Reconcile::Yield,
        Some(true) => Reconcile::Restore,
        _ => Reconcile::AdoptSystem(system_enabled),
    }
}

fn intent_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(INTENT_FILE))
        .map_err(|e| e.to_string())
}

fn read_intent<R: Runtime>(app: &AppHandle<R>) -> Option<bool> {
    let raw = fs::read_to_string(intent_path(app).ok()?).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_intent<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<(), String> {
    let path = intent_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(path, enabled.to_string()).map_err(|e| e.to_string())
}

/// Run 值仍在、但插件 `is_enabled` 为 false ⇒ 被 StartupApproved 标记为禁用，
/// 即用户在任务管理器里关掉了。
#[cfg(windows)]
fn disabled_in_os<R: Runtime>(app: &AppHandle<R>) -> bool {
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_READ},
        RegKey,
    };
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", KEY_READ)
        .and_then(|key| key.get_value::<String, _>(&app.package_info().name))
        .is_ok()
}

/// macOS / Linux 的登录项只看文件是否存在，没有「存在但被禁用」的状态。
#[cfg(not(windows))]
fn disabled_in_os<R: Runtime>(_app: &AppHandle<R>) -> bool {
    false
}

/// 启动时对账。debug 构建跳过：开发版与正式版共用同一登录项名与数据
/// 目录，若开发版也刷新路径，会把自启指向 target/debug 下的可执行文件。
pub fn reconcile<R: Runtime>(app: &AppHandle<R>) {
    if cfg!(debug_assertions) {
        return;
    }
    let manager = app.autolaunch();
    let Ok(system_enabled) = manager.is_enabled() else {
        return;
    };
    let intent = read_intent(app);
    let disabled = !system_enabled && intent == Some(true) && disabled_in_os(app);
    let result = match plan(intent, system_enabled, disabled) {
        Reconcile::AdoptSystem(enabled) if intent != Some(enabled) => write_intent(app, enabled),
        Reconcile::AdoptSystem(_) => Ok(()),
        // macOS 13+ 每次写 LaunchAgent 都会弹「已添加后台项目」通知，而
        // .app 路径在 /Applications 下是稳定的，不必每次启动都刷新。
        Reconcile::Refresh if cfg!(target_os = "macos") => Ok(()),
        Reconcile::Refresh | Reconcile::Restore => manager.enable().map_err(|e| e.to_string()),
        Reconcile::Yield => write_intent(app, false),
    };
    if let Err(e) = result {
        eprintln!("[launch-at-login] reconcile failed: {e}");
    }
}

/// 设置页读取的开关状态：系统登录项的实际状态（启动时已对账过）。
#[tauri::command]
pub fn launch_at_login_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// 设置页切换开关：写系统登录项，并记下用户意图供之后启动时对账。
#[tauri::command]
pub fn launch_at_login_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(e) = result {
        // Windows 上 Run 值本就不存在时 disable 会报错；只要最终是关着的就算成功。
        if enabled || manager.is_enabled().unwrap_or(true) {
            return Err(e.to_string());
        }
    }
    write_intent(&app, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restores_entry_removed_by_installer() {
        assert_eq!(plan(Some(true), false, false), Reconcile::Restore);
    }

    #[test]
    fn yields_when_user_disabled_in_os() {
        assert_eq!(plan(Some(true), false, true), Reconcile::Yield);
    }

    #[test]
    fn refreshes_path_when_enabled() {
        assert_eq!(plan(Some(true), true, false), Reconcile::Refresh);
    }

    #[test]
    fn adopts_system_state_without_positive_intent() {
        // 老版本升级上来（无意图文件）：记下当前系统状态。
        assert_eq!(plan(None, true, false), Reconcile::AdoptSystem(true));
        assert_eq!(plan(None, false, false), Reconcile::AdoptSystem(false));
        // 意图为关、系统却开着（用户在系统设置里重新启用）：跟随系统。
        assert_eq!(plan(Some(false), true, false), Reconcile::AdoptSystem(true));
        assert_eq!(
            plan(Some(false), false, false),
            Reconcile::AdoptSystem(false)
        );
    }
}
