use keyring::Entry;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

/// Global quick-add shortcut (Things-style): Cmd/Ctrl + Space.
const QUICK_ADD_SHORTCUT: &str = "CmdOrCtrl+Space";

/// Keyring service + account identifiers for the auth token entries.
const KEYRING_SERVICE: &str = "app.taskora.desktop";
const KEYRING_ACCOUNT: &str = "auth-token";
const KEYRING_RT_ACCOUNT: &str = "refresh-token";

fn token_entry() -> keyring::Result<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
}

fn refresh_token_entry() -> keyring::Result<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_RT_ACCOUNT)
}

/// Read the persisted access token from the OS keychain.
/// Returns null when nothing is stored (first run / logged out).
#[tauri::command]
fn keyring_get_token() -> Result<Option<String>, String> {
    match token_entry() {
        Ok(entry) => match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(format!("keychain read failed: {err}")),
        },
        Err(err) => Err(format!("keychain unavailable: {err}")),
    }
}

/// Persist (or clear, when null) the access token in the OS keychain.
#[tauri::command]
fn keyring_set_token(token: Option<String>) -> Result<(), String> {
    let entry = token_entry().map_err(|err| format!("keychain unavailable: {err}"))?;
    match token {
        Some(token) => entry
            .set_password(&token)
            .map_err(|err| format!("keychain write failed: {err}")),
        None => match entry.delete_credential() {
            Ok(()) => Ok(()),
            // Deleting an already-absent entry is a successful clear.
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(format!("keychain clear failed: {err}")),
        },
    }
}

/// Read the persisted refresh token from the OS keychain.
/// Returns null when nothing is stored (web-style cookie flow / logged out).
#[tauri::command]
fn keyring_get_refresh_token() -> Result<Option<String>, String> {
    match refresh_token_entry() {
        Ok(entry) => match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(format!("keychain read failed: {err}")),
        },
        Err(err) => Err(format!("keychain unavailable: {err}")),
    }
}

/// Persist (or clear, when null) the refresh token in the OS keychain.
#[tauri::command]
fn keyring_set_refresh_token(refresh_token: Option<String>) -> Result<(), String> {
    let entry = refresh_token_entry().map_err(|err| format!("keychain unavailable: {err}"))?;
    match refresh_token {
        Some(token) => entry
            .set_password(&token)
            .map_err(|err| format!("keychain write failed: {err}")),
        None => match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(format!("keychain clear failed: {err}")),
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            keyring_get_token,
            keyring_set_token,
            keyring_get_refresh_token,
            keyring_set_refresh_token
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
