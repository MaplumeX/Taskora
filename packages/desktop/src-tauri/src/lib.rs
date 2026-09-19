mod session;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

/// Global quick-add shortcut (Things-style): Cmd/Ctrl + Shift + Space.
/// (Plain Cmd/Ctrl+Space was dropped: Ctrl+Space is the IME toggle on
/// Windows and Cmd+Space is Spotlight on macOS — see ADR-0004.)
const QUICK_ADD_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(session::SessionLock::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second instance launched: bring the existing window to front.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
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
                    if let Some(window) = app.get_webview_window("quick-add") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit_to("quick-add", "quick-add://open", ());
                    } else {
                        // No quick-add window (shouldn't happen — declared in
                        // tauri.conf.json); fall back to focusing the main one.
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            // Quick-add window: hide on blur (fill-and-go interaction).
            if window.label() == "quick-add" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
            // macOS convention: closing the window keeps the app in the Dock
            // (re-openable). Windows/Linux: default close → process exits.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    if cfg!(target_os = "macos") {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        // Windows/Linux convention: closing the main window
                        // exits the process. The hidden quick-add window would
                        // otherwise keep the event loop alive, so exit
                        // explicitly instead of relying on last-window-close.
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            session::session_read,
            session::session_write
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
