//! 自动更新（ADR-0026）：更新目标是所连 Sync Hub 的版本，不是 GitHub latest。
//!
//! 前端判定后传入 hub 版本：`update_prepare` 取该 tag 的 `latest.json`，
//! 版本高于当前时在后台下载并验签，暂存在内存里；`update_apply` 安装并重启。
//! 目标 tag 缺本平台的安装包（构建失败、尚未上传）视为暂无更新，前端下次再查。

use std::sync::Mutex;

use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const RELEASE_DOWNLOAD_BASE: &str = "https://github.com/MaplumeX/Taskora/releases/download";

/// 已下载、待安装的更新。
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<(Update, Vec<u8>)>>);

/// 版本号只允许 semver 字符：它会拼进下载地址。
fn is_valid_version(version: &str) -> bool {
    version.len() <= 64
        && version.starts_with(|c: char| c.is_ascii_digit())
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
}

fn manifest_url(version: &str) -> String {
    format!("{RELEASE_DOWNLOAD_BASE}/v{version}/latest.json")
}

/// 准备 hub 版本的更新：本平台有该版本、且高于当前版本时下载好并返回 true。
#[tauri::command]
pub async fn update_prepare(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    version: String,
) -> Result<bool, String> {
    // 开发版与正式版共用应用标识，不能把 target/debug 更新成正式版。
    if cfg!(debug_assertions) {
        return Ok(false);
    }
    if !is_valid_version(&version) {
        return Err(format!("invalid version: {version}"));
    }
    if matches!(&*pending.0.lock().unwrap(), Some((update, _)) if update.version == version) {
        return Ok(true);
    }
    let url = manifest_url(&version)
        .parse()
        .map_err(|e| format!("invalid manifest url: {e}"))?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .and_then(|builder| builder.build())
        .map_err(|e| e.to_string())?;
    let update = match updater.check().await {
        Ok(Some(update)) if update.version == version => update,
        Ok(_) => return Ok(false),
        Err(error) => {
            // 404（tag 尚无 latest.json）或 manifest 里没有本平台：暂无更新。
            eprintln!("[updater] {version} not available: {error}");
            return Ok(false);
        }
    };
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    *pending.0.lock().unwrap() = Some((update, bytes));
    Ok(true)
}

/// 安装已准备好的更新并重启。Windows 的 NSIS 安装程序会自行退出本进程。
#[tauri::command]
pub fn update_apply(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    version: String,
) -> Result<(), String> {
    let mut slot = pending.0.lock().unwrap();
    if !matches!(&*slot, Some((update, _)) if update.version == version) {
        return Err(format!("update {version} is not prepared"));
    }
    let (update, bytes) = slot.take().expect("checked above");
    drop(slot);
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_semver_versions() {
        assert!(is_valid_version("0.10.0"));
        assert!(is_valid_version("1.0.0-rc.1"));
        assert!(is_valid_version("1.0.0+build.5"));
    }

    #[test]
    fn rejects_values_that_could_escape_the_url() {
        assert!(!is_valid_version(""));
        assert!(!is_valid_version("v0.10.0"));
        assert!(!is_valid_version("0.10.0/../../evil"));
        assert!(!is_valid_version("0.10.0?x=1"));
        assert!(!is_valid_version(&"1".repeat(65)));
    }

    #[test]
    fn manifest_follows_the_hub_version_tag() {
        assert_eq!(
            manifest_url("0.10.0"),
            "https://github.com/MaplumeX/Taskora/releases/download/v0.10.0/latest.json"
        );
    }
}
