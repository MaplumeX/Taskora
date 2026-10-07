//! 用系统默认程序打开附件（ADR-0019）。
//!
//! webview 以原始字节 IPC 传入文件内容（`invoke('attachment_open', bytes,
//! { headers })`），文件名与 Blob hash 放在请求头里。这里把字节写到应用
//! 缓存目录 `attachments/<hash>/<文件名>`，再交给系统打开。文件名先清洗：
//! 去掉路径分隔与 shell 元字符，挡住路径穿越与命令解析。

use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request};
use tauri::Manager;

const NAME_HEADER: &str = "x-attachment-name";
const HASH_HEADER: &str = "x-attachment-hash";

/// 百分号解码（JS 侧 encodeURIComponent）。非法序列原样保留。
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// 只保留安全的文件名字符；空名或只剩点号时用缺省名。
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "\\/:*?\"<>|&^%!$`'".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "attachment".into()
    } else {
        trimmed.chars().take(200).collect()
    }
}

fn header(request: &Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
}

#[tauri::command]
pub fn attachment_open(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("attachment bytes must be sent as a raw body".into());
    };
    let hash = header(&request, HASH_HEADER).unwrap_or_default();
    if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid attachment hash".into());
    }
    let name = sanitize_file_name(&header(&request, NAME_HEADER).unwrap_or_default());
    let dir: PathBuf = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("attachments")
        .join(&hash);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    open_with_default_app(&path)
}

fn open_with_default_app(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    // explorer 直接接收路径参数，不经 cmd.exe 二次解析
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(percent_decode("%E5%8F%91%E7%A5%A8.pdf"), "发票.pdf");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("a%zzb"), "a%zzb");
    }

    #[test]
    fn sanitizes_file_names() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "_.._etc_passwd");
        assert_eq!(sanitize_file_name("a&calc.exe"), "a_calc.exe");
        assert_eq!(sanitize_file_name("..."), "attachment");
        assert_eq!(sanitize_file_name("报告 v2.pdf"), "报告 v2.pdf");
    }
}
