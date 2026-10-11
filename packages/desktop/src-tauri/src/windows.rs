//! 多窗口（.scratch/multi-window，对齐 Things 3 Mac）：副窗口与主窗口同样的
//! 融合式外壳（ADR 0021），打开一个指定路由；数据经主窗口的 Engine 读写
//! （ADR 0025）。副窗口不记几何（window-state 只跟踪 main），关闭即销毁。
use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 副窗口 label 前缀（capabilities 以 `window-*` 匹配）。
pub(crate) const SECONDARY_PREFIX: &str = "window-";

/// 新窗口相对发起窗口的错开距离（逻辑像素），层叠排列。
const CASCADE_OFFSET: f64 = 28.0;

static NEXT_WINDOW: AtomicU32 = AtomicU32::new(1);

pub(crate) fn is_secondary(label: &str) -> bool {
    label.starts_with(SECONDARY_PREFIX)
}

/// 路由只放行站内路径的安全字符（id 是 uuid），其余一律回到 Today。
fn sanitize_route(route: &str) -> &str {
    let safe = route.starts_with('/')
        && route
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_'));
    if safe {
        route
    } else {
        "/today"
    }
}

/// 打开一个副窗口显示 route。尺寸取发起窗口的大小，位置相对它错开。
/// Windows 上同步命令里建窗口会死锁，必须是 async 命令。
#[tauri::command]
pub async fn open_window(
    app: AppHandle,
    window: WebviewWindow,
    route: String,
) -> Result<(), String> {
    let label = format!(
        "{SECONDARY_PREFIX}{}",
        NEXT_WINDOW.fetch_add(1, Ordering::Relaxed)
    );
    let url = format!("index.html?window=secondary&route={}", sanitize_route(&route));
    let mut builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title("Taskora")
        .min_inner_size(420.0, 320.0)
        // 与主窗口一致：先处理装饰再显示，原生标题栏不闪。
        .visible(false);
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }

    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    match (window.outer_position(), window.inner_size()) {
        (Ok(position), Ok(size)) if !window.is_maximized().unwrap_or(false) => {
            let position = position.to_logical::<f64>(scale);
            let size = size.to_logical::<f64>(scale);
            builder = builder
                .inner_size(size.width, size.height)
                .position(position.x + CASCADE_OFFSET, position.y + CASCADE_OFFSET);
        }
        // 发起窗口最大化 / 读不到几何：默认尺寸居中。
        _ => {
            builder = builder.inner_size(1200.0, 800.0).center();
        }
    }

    let created = builder.build().map_err(|e| e.to_string())?;
    created.show().map_err(|e| e.to_string())?;
    let _ = created.set_focus();
    Ok(())
}

/// 关闭全部副窗口（登出：副窗口不显示登录页）。
#[tauri::command]
pub fn close_secondary_windows(app: AppHandle) {
    for (label, window) in app.webview_windows() {
        if is_secondary(&label) {
            let _ = window.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_route_keeps_app_paths() {
        assert_eq!(sanitize_route("/today"), "/today");
        assert_eq!(
            sanitize_route("/projects/0b6c1f9e-3c1a-4c55-9d1e-1f0f7d0d6a11"),
            "/projects/0b6c1f9e-3c1a-4c55-9d1e-1f0f7d0d6a11"
        );
        assert_eq!(sanitize_route("/review/projects"), "/review/projects");
    }

    #[test]
    fn sanitize_route_rejects_everything_else() {
        assert_eq!(sanitize_route(""), "/today");
        assert_eq!(sanitize_route("today"), "/today");
        assert_eq!(sanitize_route("/today&window=main"), "/today");
        assert_eq!(sanitize_route("https://example.com"), "/today");
        assert_eq!(sanitize_route("/a b"), "/today");
    }

    #[test]
    fn secondary_labels() {
        assert!(is_secondary("window-3"));
        assert!(!is_secondary("main"));
        assert!(!is_secondary("quick-add"));
    }
}
