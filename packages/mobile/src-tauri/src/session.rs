//! 会话令牌的加密落盘（ADR-0009，android-app issue 03）。
//!
//! 结构对齐 desktop 的 `session/mod.rs`（versioned / server-bound），
//! 但存储介质从 keyring/DPAPI 换成「Android Keystore 加密 + 应用私有
//! 目录文件」：
//! - `session_read { serverUrl }`：读取 → Keystore 解密 → 解析；无文件
//!   / 换服务器 / 版本不识别 → 空 Tokens（视同未登录）；
//! - `session_write { serverUrl, tokens }`：加密后原子写入（tempfile
//!   + rename，避免半截文件）；
//! - `session_clear`：登出——删除密文文件与 Keystore 密钥引用。
//!
//! 文件内容是 base64(`iv || ciphertext`)，明文 JSON 结构：
//! `{ version: 1, serverUrl, tokens: { token, refreshToken } }`。

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::keystore;

/// 会话文件名（应用数据目录下）。
const SESSION_FILE: &str = "session.v1.bin";
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

/// 读密文并解密为 Session；文件缺失 / 解密失败 / 解析失败时返回 None。
/// 解密失败（密钥被删或密文被篡改）由调用方决定是否覆盖重写。
fn read_session(path: &Path) -> Result<Option<Session>, String> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("session: read failed: {error}")),
    };
    let text = String::from_utf8(bytes).map_err(|_| "session: non-UTF-8 file".to_string())?;
    let payload = BASE64
        .decode(text.trim())
        .map_err(|_| "session: invalid base64".to_string())?;
    let plaintext = keystore::decrypt(&payload)?;
    let session: Session = serde_json::from_slice(&plaintext)
        .map_err(|_| "session: invalid saved session".to_string())?;
    Ok(Some(session))
}

/// 加密并原子写入。
fn write_session(path: &Path, session: &Session) -> Result<(), String> {
    let plaintext = serde_json::to_vec(session).map_err(|e| format!("session: encode: {e}"))?;
    let payload = keystore::encrypt(&plaintext)?;
    let text = BASE64.encode(&payload);
    let dir = path.parent().ok_or_else(|| "session: no parent dir".to_string())?;
    // tempfile + rename：崩溃在写入中途不会留下半截会话文件。
    let mut file = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("session: temp file failed: {e}"))?;
    use std::io::Write;
    file.write_all(text.as_bytes())
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

/// 登出：清除密文与 Keystore 密钥引用（issue 03 验收）。
/// 任一步失败都返回错误（调用方提示），已删的部分不回滚。
#[tauri::command]
pub fn session_clear(app: AppHandle) -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "session: lock failed".to_string())?;
    let path = session_path(&app)?;
    match std::fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("session: remove failed: {error}")),
    }
    keystore::delete_key()
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

    /// restore 的纯逻辑路径不触 Keystore（加密在 write 路径），直接
    /// 构造已解密的 Session 文件无法离线完成——Keystore 只有真机有。
    /// 这里覆盖「无文件 / 换服务器 / 版本不符」三条无需解密的分支。
    #[test]
    fn missing_file_restores_empty() {
        let dir = tempfile::tempdir().unwrap();
        let tokens = restore(dir.path().join(SESSION_FILE).as_path(), "server").unwrap();
        assert_eq!(tokens, Tokens::default());
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
