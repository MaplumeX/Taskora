//! 会话令牌的落盘（android-app issue 03，ADR-0011）。
//!
//! 结构对齐 desktop 的 `session/mod.rs`（versioned / server-bound）。
//! 存储介质：应用私有目录（`/data/data/app.taskora.mobile/files`）下的
//! **明文 JSON**——ADR-0009 的 Android Keystore JNI 桥在真机登录时崩溃
//! （无真机日志定位，见 ADR-0011），v1 退回明文存储：
//! - `session_read { serverUrl }`：读取解析；无文件 / 换服务器 / 版本不
//!   识别 → 空 Tokens（视同未登录）；
//! - `session_write { serverUrl, tokens }`：原子写入（tempfile + rename，
//!   避免半截文件）；
//! - `session_clear`：登出——删除会话文件。
//!
//! 未 root 设备上应用私有目录受 Linux 沙箱保护（其他 App / 普通用户
//! 均不可读）；root 与 adb 备份提取面前明文裸奔——这是 ADR-0011 采纳
//! 的已知降级。文件内容：
//! `{ version: 1, serverUrl, tokens: { token, refreshToken } }`。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// 会话文件名（应用数据目录下）。
/// `.json`（非早期试验版本的加密 `.bin`）：换名避免读到旧密文。
const SESSION_FILE: &str = "session.v1.json";
const SESSION_VERSION: u8 = 1;

#[derive(Clone, Default, Debug, Deserialize, Serialize, PartialEq, Eq)]
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

/// 会话目录（Tauri app data dir），由 lib.rs 的 setup 注入。
#[derive(Default)]
pub struct SessionDir(PathBuf);

/// 串行化并发读写（同一 webview 内的登录/登出/旋转竞争）。
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// 在 setup 阶段注册会话目录。
pub fn manage_state(
    app: &mut tauri::App,
    data_dir: PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(&data_dir)?;
    app.manage(SessionDir(data_dir));
    Ok(())
}

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.state::<SessionDir>().0.join(SESSION_FILE))
}

/// 读取并解析 Session；文件缺失返回 None，内容损坏报错。
fn read_session(path: &Path) -> Result<Option<Session>, String> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("session: read failed: {error}")),
    };
    let session: Session = serde_json::from_slice(&bytes)
        .map_err(|_| "session: invalid saved session".to_string())?;
    Ok(Some(session))
}

/// 原子写入。
fn write_session(path: &Path, session: &Session) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(session)
        .map_err(|e| format!("session: encode: {e}"))?;
    let dir = path.parent().ok_or_else(|| "session: no parent dir".to_string())?;
    // tempfile + rename：崩溃在写入中途不会留下半截会话文件。
    let mut file = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("session: temp file failed: {e}"))?;
    use std::io::Write;
    file.write_all(&bytes)
        .and_then(|_| file.flush())
        .map_err(|e| format!("session: write failed: {e}"))?;
    file.persist(path)
        .map_err(|e| format!("session: persist failed: {e}"))?;
    Ok(())
}

/// 读 + 校验：版本不识别 → 错误（提示用户重置）；换服务器 → 空 Tokens
/// （凭据不跨服务器共享）。文件不存在 → 空 Tokens。
fn restore(path: &Path, server_url: &str) -> Result<Tokens, String> {
    let Some(session) = read_session(path)? else {
        return Ok(Tokens::default());
    };
    if session.version != SESSION_VERSION {
        return Err("session: unsupported saved session version".into());
    }
    if session.server_url != server_url {
        return Ok(Tokens::default());
    }
    Ok(session.tokens)
}

/// 读取会话（未登录返回空 Tokens）。
#[tauri::command]
pub fn session_read(app: AppHandle, server_url: String) -> Result<Tokens, String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "session: lock failed".to_string())?;
    let path = session_path(&app)?;
    restore(&path, &server_url)
}

/// 写入会话（登录 / 令牌旋转）。
#[tauri::command]
pub fn session_write(
    app: AppHandle,
    server_url: String,
    tokens: Tokens,
) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "session: lock failed".to_string())?;
    let path = session_path(&app)?;
    write_session(
        &path,
        &Session {
            version: SESSION_VERSION,
            server_url,
            tokens,
        },
    )
}

/// 登出：删除会话文件（issue 03 验收）。
#[tauri::command]
pub fn session_clear(app: AppHandle) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "session: lock failed".to_string())?;
    let path = session_path(&app)?;
    match std::fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("session: remove failed: {error}")),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(server_url: &str, token: Option<&str>) -> Session {
        Session {
            version: SESSION_VERSION,
            server_url: server_url.to_owned(),
            tokens: Tokens {
                token: token.map(str::to_owned),
                refresh_token: token.map(|_| "refresh".to_owned()),
            },
        }
    }

    #[test]
    fn missing_file_restores_empty() {
        let dir = tempfile::tempdir().unwrap();
        let tokens = restore(dir.path().join(SESSION_FILE).as_path(), "server").unwrap();
        assert_eq!(tokens, Tokens::default());
    }

    /// 明文存储不再依赖 Android Keystore，round-trip 可在 host 全覆盖。
    #[test]
    fn write_then_restore_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SESSION_FILE);
        write_session(&path, &session("server", Some("access"))).unwrap();
        let tokens = restore(&path, "server").unwrap();
        assert_eq!(tokens.token.as_deref(), Some("access"));
        assert_eq!(tokens.refresh_token.as_deref(), Some("refresh"));
    }

    #[test]
    fn credentials_are_not_shared_between_servers() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SESSION_FILE);
        write_session(&path, &session("server-a", Some("access"))).unwrap();
        let tokens = restore(&path, "server-b").unwrap();
        assert_eq!(tokens, Tokens::default());
    }

    #[test]
    fn corrupted_file_is_an_error_not_a_logout() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SESSION_FILE);
        std::fs::write(&path, b"not json").unwrap();
        assert!(restore(&path, "server").is_err());
    }

    #[test]
    fn fields_are_camel_case_on_the_wire() {
        // TS 侧（secure-token-store.ts）以 camelCase 读写：
        let json = serde_json::to_string(&Tokens {
            token: Some("t".into()),
            refresh_token: None,
        })
        .unwrap();
        assert!(json.contains("\"token\""));
        assert!(json.contains("\"refreshToken\""));
        assert!(!json.contains("refresh_token"));
    }
}
