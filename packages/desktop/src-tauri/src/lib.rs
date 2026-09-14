use keyring::Entry;
use tauri::Manager;

/// Keyring service + account identifiers for the auth token entry.
const KEYRING_SERVICE: &str = "app.taskora.desktop";
const KEYRING_ACCOUNT: &str = "auth-token";

fn token_entry() -> keyring::Result<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
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
        .on_window_event(|window, event| {
            // macOS convention: closing the window keeps the app in the Dock
            // (re-openable). Windows/Linux: default close → process exits.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && cfg!(target_os = "macos") {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            keyring_get_token,
            keyring_set_token
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
