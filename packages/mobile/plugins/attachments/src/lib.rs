//! Taskora 安卓附件打开本地插件（ADR-0019，task-attachments issue 06）。
//!
//! webview 以原始字节 IPC 传入附件内容（`invoke('plugin:attachments|open',
//! bytes, { headers })`），文件名、Blob hash 与 mimeType 放在请求头里。
//! Rust 侧把字节写到应用缓存目录 `attachments/<hash>/<文件名>`（与桌面端
//! `attachment_open` 同一路数，文件名先清洗），再由 Kotlin 侧经
//! FileProvider 发 `ACTION_VIEW`，交给系统里能打开该类型的应用。结构同
//! `tauri-plugin-statusbar`：桌面端（测试编译）为 no-op。

use serde::Serialize;
use tauri::{
    ipc::{InvokeBody, Request},
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.taskora.mobile.attachments";

const NAME_HEADER: &str = "x-attachment-name";
const HASH_HEADER: &str = "x-attachment-hash";
const MIME_HEADER: &str = "x-attachment-mime";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(desktop, allow(dead_code))]
struct OpenArgs {
    path: String,
    mime_type: String,
}

pub struct Attachments<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    #[cfg(desktop)]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> Attachments<R> {
    fn open_path(&self, path: String, mime_type: String) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("open", OpenArgs { path, mime_type })
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            let _ = (path, mime_type);
            Err("unsupported platform".into())
        }
    }
}

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

/// mimeType 只接受 `type/subtype` 形态，其余按通用二进制处理。
fn sanitize_mime(mime: &str) -> String {
    let valid = mime.split_once('/').is_some_and(|(kind, sub)| {
        !kind.is_empty()
            && !sub.is_empty()
            && mime
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "/.+-_".contains(c))
    });
    if valid {
        mime.to_ascii_lowercase()
    } else {
        "application/octet-stream".into()
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
fn open<R: Runtime>(app: tauri::AppHandle<R>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("attachment bytes must be sent as a raw body".into());
    };
    let hash = header(&request, HASH_HEADER).unwrap_or_default();
    if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid attachment hash".into());
    }
    let name = sanitize_file_name(&header(&request, NAME_HEADER).unwrap_or_default());
    let mime_type = sanitize_mime(&header(&request, MIME_HEADER).unwrap_or_default());
    // 缓存目录即 Context.getCacheDir()，与 FileProvider 的 cache-path 对应
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("attachments")
        .join(&hash);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    app.state::<Attachments<R>>()
        .open_path(path.to_string_lossy().into_owned(), mime_type)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("attachments")
        .invoke_handler(tauri::generate_handler![open])
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "AttachmentsPlugin")?;

            #[cfg(mobile)]
            app.manage(Attachments { handle });
            #[cfg(desktop)]
            app.manage(Attachments::<R> {
                _marker: std::marker::PhantomData,
            });

            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(percent_decode("%E5%8F%91%E7%A5%A8.pdf"), "发票.pdf");
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn sanitizes_file_names() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "_.._etc_passwd");
        assert_eq!(sanitize_file_name("..."), "attachment");
        assert_eq!(sanitize_file_name("报告 v2.pdf"), "报告 v2.pdf");
    }

    #[test]
    fn sanitizes_mime_types() {
        assert_eq!(sanitize_mime("application/PDF"), "application/pdf");
        assert_eq!(
            sanitize_mime(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(sanitize_mime(""), "application/octet-stream");
        assert_eq!(
            sanitize_mime("text/html; x=\"y\""),
            "application/octet-stream"
        );
    }
}
