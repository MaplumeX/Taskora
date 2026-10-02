//! Taskora Android Activity 级窗口控制本地插件。
//!
//! 系统栏安全区：edge-to-edge 下部分 WebView 的 `env(safe-area-inset-*)`
//! 为 0，原生读 WindowInsets 兜底（JS 取一次 + `insets` 事件推送变化）。
//!
//! 系统栏图标明暗：状态栏 / 导航栏透明，底下是 App 自身背景，图标明暗
//! 需跟随 App 实际主题（含手动指定的亮 / 暗），由 JS 在主题变化时设置。
//!
//! 退到后台（android-app issue 08）：
//! 根页返回手势的收尾动作：把任务移到后台（回桌面），而不是 `app.exit`
//! 终止进程——对齐标准 Android 语义（进程与 WebView 状态保留）。必须经
//! 插件拿 `Activity`：`ndk-context` 由 tao 以 Application Context 初始化
//! （tao PR #1266），而 `moveTaskToBack` 是 `Activity` 的方法。结构同
//! `tauri-plugin-statusbar`：桌面端（测试编译）为 no-op。

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.taskora.mobile.background";

/// 系统栏占用的高度（CSS px）：顶部状态栏 / 刘海，底部导航栏 / 手势条。
#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize)]
pub struct SafeAreaInsets {
    pub top: f64,
    pub bottom: f64,
}

/// `set_system_bar_appearance` 的参数：App 当前是否为暗色主题。
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SystemBarAppearanceArgs {
    pub dark: bool,
}

/// Activity 级窗口控制的原生侧句柄。
pub struct Background<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    /// `fn() -> R` 无条件 Send + Sync（PhantomData<R> 继承 R 的约束），
    /// 受管理状态必须两者皆是。
    #[cfg(desktop)]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> Background<R> {
    pub fn move_to_back(&self) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("moveToBack", ())
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(())
        }
    }

    pub fn safe_area_insets(&self) -> Result<SafeAreaInsets, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<SafeAreaInsets>("safeAreaInsets", ())
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(SafeAreaInsets::default())
        }
    }

    pub fn set_system_bar_appearance(&self, dark: bool) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("setSystemBarAppearance", SystemBarAppearanceArgs { dark })
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            let _ = dark;
            Ok(())
        }
    }
}

pub trait BackgroundExt<R: Runtime> {
    fn background(&self) -> &Background<R>;
}

impl<R: Runtime, T: Manager<R>> BackgroundExt<R> for T {
    fn background(&self) -> &Background<R> {
        self.state::<Background<R>>().inner()
    }
}

#[tauri::command]
async fn move_to_back<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.background().move_to_back()
}

#[tauri::command]
async fn safe_area_insets<R: Runtime>(app: tauri::AppHandle<R>) -> Result<SafeAreaInsets, String> {
    app.background().safe_area_insets()
}

#[tauri::command]
async fn set_system_bar_appearance<R: Runtime>(
    app: tauri::AppHandle<R>,
    dark: bool,
) -> Result<(), String> {
    app.background().set_system_bar_appearance(dark)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("background")
        .invoke_handler(tauri::generate_handler![
            move_to_back,
            safe_area_insets,
            set_system_bar_appearance
        ])
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "BackgroundPlugin")?;

            #[cfg(mobile)]
            app.manage(Background { handle });
            #[cfg(desktop)]
            app.manage(Background::<R> {
                _marker: std::marker::PhantomData,
            });

            Ok(())
        })
        .build()
}
