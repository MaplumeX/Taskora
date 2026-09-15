//! Versioned, server-bound sessions. Windows uses a per-user DPAPI file;
//! other platforms keep a single atomic session entry in their keychain.
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[cfg(windows)]
mod windows;

const SERVICE: &str = "app.taskora.desktop";

#[derive(Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    token: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    version: u8,
    server_url: String,
    tokens: Tokens,
}

#[derive(Default)]
pub struct SessionLock(Mutex<()>);

fn read_entry(account: &str) -> Result<Option<String>, String> {
    let entry =
        Entry::new(SERVICE, account).map_err(|e| format!("Session storage unavailable: {e}"))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Session read failed: {e}")),
    }
}

fn read_legacy() -> Result<Tokens, String> {
    Ok(Tokens {
        token: read_entry("auth-token")?,
        refresh_token: read_entry("refresh-token")?,
    })
}

fn remove_legacy() {
    // The new session (including a signed-out tombstone) is authoritative.
    // A failed legacy cleanup must never roll back a committed rotation.
    for account in ["auth-token", "refresh-token"] {
        if let Ok(entry) = Entry::new(SERVICE, account) {
            let _ = entry.delete_credential();
        }
    }
}

#[cfg(windows)]
fn read(app: &AppHandle) -> Result<Option<Session>, String> {
    use tauri::Manager;
    windows::read(
        &app.path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?
            .join("session.dpapi"),
    )
}

#[cfg(windows)]
fn write(app: &AppHandle, session: &Session) -> Result<(), String> {
    use tauri::Manager;
    windows::write(
        &app.path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?
            .join("session.dpapi"),
        session,
    )
}

#[cfg(not(windows))]
fn read(_app: &AppHandle) -> Result<Option<Session>, String> {
    read_entry("session-v1")?
        .map(|value| serde_json::from_str(&value).map_err(|_| "Invalid saved session".to_string()))
        .transpose()
}

#[cfg(not(windows))]
fn write(_app: &AppHandle, session: &Session) -> Result<(), String> {
    let value =
        serde_json::to_string(session).map_err(|_| "Session encoding failed".to_string())?;
    Entry::new(SERVICE, "session-v1")
        .map_err(|e| format!("Session storage unavailable: {e}"))?
        .set_password(&value)
        .map_err(|e| format!("Session write failed: {e}"))
}

fn restore(
    server_url: &str,
    current: Option<Session>,
    legacy: impl FnOnce() -> Result<Tokens, String>,
    save: impl FnOnce(&Session) -> Result<(), String>,
    cleanup: impl FnOnce(),
) -> Result<Tokens, String> {
    let session = match current {
        Some(session) => session,
        None => {
            let session = Session {
                version: 1,
                server_url: server_url.to_owned(),
                tokens: legacy()?,
            };
            // Never delete the only usable copy before the new store commits.
            save(&session)?;
            cleanup();
            session
        }
    };
    if session.version != 1 {
        return Err("Unsupported saved session version".into());
    }
    if session.server_url != server_url {
        return Ok(Tokens::default());
    }
    Ok(session.tokens)
}

#[tauri::command]
pub fn session_read(
    app: AppHandle,
    state: State<'_, SessionLock>,
    server_url: String,
) -> Result<Tokens, String> {
    let _guard = state.0.lock().map_err(|_| "Session storage lock failed")?;
    restore(
        &server_url,
        read(&app)?,
        read_legacy,
        |session| write(&app, session),
        remove_legacy,
    )
}

#[tauri::command]
pub fn session_write(
    app: AppHandle,
    state: State<'_, SessionLock>,
    server_url: String,
    tokens: Tokens,
) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "Session storage lock failed")?;
    // Keep an encrypted empty session on logout so stale legacy entries
    // cannot be imported again, even if their deletion failed.
    write(
        &app,
        &Session {
            version: 1,
            server_url,
            tokens,
        },
    )?;
    remove_legacy();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn tokens() -> Tokens {
        Tokens {
            token: Some("access".into()),
            refresh_token: Some("refresh".into()),
        }
    }

    #[test]
    fn migration_commits_before_removing_legacy() {
        let events = RefCell::new(Vec::new());
        let restored = restore(
            "server",
            None,
            || Ok(tokens()),
            |session| {
                assert!(session.tokens == tokens());
                events.borrow_mut().push("save");
                Ok(())
            },
            || events.borrow_mut().push("cleanup"),
        )
        .unwrap();
        assert!(restored == tokens());
        assert_eq!(*events.borrow(), ["save", "cleanup"]);
    }

    #[test]
    fn failed_migration_keeps_legacy() {
        assert!(restore(
            "server",
            None,
            || Ok(tokens()),
            |_| Err("disk full".into()),
            || panic!("deleted legacy")
        )
        .is_err());
    }

    #[test]
    fn signed_out_tombstone_does_not_import_legacy_again() {
        let current = Session {
            version: 1,
            server_url: "server".into(),
            tokens: Tokens::default(),
        };
        let restored = restore(
            "server",
            Some(current),
            || panic!("read legacy"),
            |_| panic!("wrote session"),
            || panic!("cleanup"),
        )
        .unwrap();
        assert!(restored == Tokens::default());
    }

    #[test]
    fn credentials_are_not_shared_between_servers() {
        let current = Session {
            version: 1,
            server_url: "server-a".into(),
            tokens: tokens(),
        };
        let restored = restore(
            "server-b",
            Some(current),
            || panic!("read legacy"),
            |_| panic!("wrote session"),
            || {},
        )
        .unwrap();
        assert!(restored == Tokens::default());
    }
}
