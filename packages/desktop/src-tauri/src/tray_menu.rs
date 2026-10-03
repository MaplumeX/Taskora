//! 托盘右键菜单：Windows / macOS 用自绘的 `tray-menu` webview 窗口（与
//! App 同主题、同语言，见 desktop/src/TrayMenuApp.tsx）替代系统原生菜单；
//! Linux 托盘（AppIndicator）不上报点击事件，只能挂原生菜单，文案由主窗口
//! 经 `tray_set_labels` 同步，同样跟随 App 语言。
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

use crate::{show_main_window, show_quick_add};

pub(crate) const TRAY_ID: &str = "taskora-tray";
/// 自绘菜单窗口的 label（tauri.conf.json）。
pub(crate) const WINDOW: &str = "tray-menu";

/// 在光标处弹出自绘菜单：默认向上展开（任务栏在底部的常见布局），放不下
/// 时向下；水平方向优先从光标向右，越界则向左。最后夹进光标所在显示器的
/// 工作区，保证不压住任务栏、不出屏。
pub(crate) fn show(app: &AppHandle, cursor: PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window(WINDOW) else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let (w, h) = (size.width as i32, size.height as i32);
    let (cx, cy) = (cursor.x.round() as i32, cursor.y.round() as i32);
    let (mut x, mut y) = (cx, cy - h);

    if let Ok(Some(monitor)) = app.monitor_from_point(cursor.x, cursor.y) {
        let area = monitor.work_area();
        let (left, top) = (area.position.x, area.position.y);
        let right = left + area.size.width as i32;
        let bottom = top + area.size.height as i32;
        if x + w > right {
            x = cx - w;
        }
        if y < top {
            y = cy;
        }
        x = x.clamp(left, (right - w).max(left));
        y = y.clamp(top, (bottom - h).max(top));
    }

    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.show();
    let _ = window.set_focus();
    let _ = app.emit_to(WINDOW, "tray-menu://open", ());
}

/// 自绘菜单项的点击：先收起菜单，再执行动作。
#[tauri::command]
pub(crate) fn tray_menu_action(app: AppHandle, action: String) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.hide();
    }
    match action.as_str() {
        "show" => show_main_window(&app),
        "quick-add" => show_quick_add(&app),
        "quit" => app.exit(0),
        _ => {}
    }
}

/// 主窗口按当前语言同步托盘文案：悬停提示（全平台）+ Linux 原生菜单项。
#[tauri::command]
pub(crate) fn tray_set_labels(
    app: AppHandle,
    tooltip: String,
    show: String,
    new_task: String,
    quit: String,
) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
    #[cfg(target_os = "linux")]
    if let Some(items) = app.try_state::<NativeMenuItems>() {
        let _ = items.show.set_text(&show);
        let _ = items.new_task.set_text(&new_task);
        let _ = items.quit.set_text(&quit);
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (show, new_task, quit);
}

#[cfg(target_os = "linux")]
struct NativeMenuItems {
    show: tauri::menu::MenuItem<tauri::Wry>,
    new_task: tauri::menu::MenuItem<tauri::Wry>,
    quit: tauri::menu::MenuItem<tauri::Wry>,
}

/// Linux：挂原生菜单（英文占位，主窗口启动后经 `tray_set_labels` 替换）。
#[cfg(target_os = "linux")]
pub(crate) fn attach_native_menu(
    app: &tauri::App,
    tray: tauri::tray::TrayIconBuilder<tauri::Wry>,
) -> tauri::Result<tauri::tray::TrayIconBuilder<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

    let show = MenuItem::with_id(app, "show", "Show Taskora", true, None::<&str>)?;
    let new_task = MenuItem::with_id(app, "quick-add", "New Task", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Taskora", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &new_task, &separator, &quit])?;
    app.manage(NativeMenuItems {
        show,
        new_task,
        quit,
    });
    Ok(tray
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quick-add" => show_quick_add(app),
            "quit" => app.exit(0),
            _ => {}
        }))
}
