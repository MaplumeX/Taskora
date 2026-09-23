mod session;
mod sqlite;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::ShortcutState;

/// 跳转到系统通知设置页（Reminders spec：授权被拒后的引导入口）。
/// 桌面三平台无统一入口：macOS 开通知偏好设置面板，Windows 开
/// ms-settings；Linux 无标准方案，返回错误（JS 侧静默吞掉）。
#[tauri::command]
fn open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:notifications"])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        return Err("opening notification settings is not supported on this platform".into());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        return Err("unsupported platform".into());
    }
    #[allow(unreachable_code)]
    Ok(())
}

/// Global quick-add shortcut (Things-style): Cmd/Ctrl + Shift + Space.
/// (Plain Cmd/Ctrl+Space was dropped: Ctrl+Space is the IME toggle on
/// Windows and Cmd+Space is Spotlight on macOS — see ADR-0004.)
const QUICK_ADD_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";

/// Bring the (possibly hidden) main window to the front.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Show the floating quick-add window (tray "New Task" entry uses the
/// same path as the global shortcut).
fn show_quick_add(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("quick-add") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit_to("quick-add", "quick-add://open", ());
    } else {
        show_main_window(app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::SessionLock::default())
        // Remember main-window size/position across launches. Quick-add is
        // a centered borderless popup — denylisted so its geometry is not
        // restored. VISIBLE is excluded: close-to-tray hides the window,
        // and that hidden state must not leak into the next launch
        // (fresh starts always show the main window).
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["quick-add"])
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second instance launched: bring the existing window to front.
            show_main_window(app);
        }))
        // 开机自启（desktop-v1 spec V1.x）：注册系统登录启动项，开关由
        // 设置「通用」页通过 autostart 插件命令控制。macOS 走 LaunchAgent
        //（不弹终端、随应用卸载清理），参数传 `--hidden` 供静默启动使用。
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([QUICK_ADD_SHORTCUT])
                .expect("failed to register quick-add shortcut")
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    // Only the quick-add shortcut is registered; toggling it
                    // shows/hides the floating quick-add window.
                    let _ = shortcut; // (multiple shortcuts would branch here)
                    show_quick_add(app);
                })
                .build(),
        )
        // 系统通知（Reminders spec）：到点本地提醒的发送通道。
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // System tray (desktop shell hardening): re-entry point for a
            // hidden main window + the explicit quit path. Without it, the
            // Windows/Linux close-to-tray behavior below would leave no way
            // to bring the app back or exit it.
            let show = MenuItem::with_id(app, "show", "Show Taskora", true, None::<&str>)?;
            let quick_add = MenuItem::with_id(app, "quick-add", "New Task", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Taskora", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quick_add, &quit])?;
            TrayIconBuilder::with_id("taskora-tray")
                .icon(
                    app.default_window_icon()
                        .expect("missing window icon")
                        .clone(),
                )
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quick-add" => show_quick_add(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left click toggles the main window (right click opens
                    // the menu — the platform default).
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            // 开机自启的 --hidden 启动：主窗口隐藏、仅托盘常驻，避免登录时
            // 弹窗打扰；用户从托盘 / 快捷键 / 再次启动随时唤出。手动启动
            // 不带参数，行为不变。
            if std::env::args().any(|arg| arg == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            // Local Replica 状态注册（ADR-0007）。注意：Builder 的 setup /
            // invoke_handler 都是「替换」语义，不能由模块各自链一次 ——
            // v0.4.0 曾因此让 sqlite::install 覆盖掉 session 命令注册与
            // 托盘初始化，桌面端表现为登录恢复永远失败。
            sqlite::manage_state(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Quick-add window: hide on blur (fill-and-go interaction).
            if window.label() == "quick-add" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
            // Close hides to the tray on every platform: the global
            // quick-add shortcut must keep working after "closing" the
            // window. Re-open via tray / Dock icon / second launch; exit
            // via the tray's Quit entry. (Previously Windows/Linux exited
            // on close, which silently killed the shortcut.)
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            session::session_read,
            session::session_write,
            sqlite::sql_exec,
            sqlite::sql_all,
            sqlite::sql_run,
            sqlite::sql_use_db,
            open_notification_settings
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // macOS Dock icon click → re-show the (possibly hidden) main window.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}
