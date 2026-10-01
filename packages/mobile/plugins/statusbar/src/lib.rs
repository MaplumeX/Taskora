//! Taskora 安卓「状态栏快速添加」本地插件（android-status-bar issue 02）。
//!
//! 单行自定义布局（RemoteViews）的 ongoing 通知，由 specialUse 前台服务持
//! 有；「▸」切换下一条、「＋」拉起快速添加浮层（QuickAddActivity）。结构
//! 以 tauri-plugin-timer 为模板：所有按钮文案由 JS 注入，桌面端为 no-op。

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.taskora.mobile.statusbar";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowArgs {
    /// 通知标题：当前一条未完成任务（或快速添加入口文案）。
    pub title: String,
    /// LOW 渠道名（渠道创建后名字可随语言更新，importance 不变）。
    pub channel_name: String,
    /// 快速添加浮层的输入框占位文案。
    pub quick_add_hint: String,
    /// 快速添加浮层的提交按钮文案。
    pub submit_label: String,
}

/// 点通知本体携带的导航目标（issue 03）：`today` 或缺失。
#[derive(Debug, Clone, Default, Deserialize)]
#[cfg_attr(desktop, allow(dead_code))]
struct NavigationResponse {
    destination: Option<String>,
}

/// 状态栏通知的原生侧句柄。
pub struct StatusBar<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    /// `fn() -> R` 无条件 Send + Sync（PhantomData<R> 继承 R 的约束），
    /// 受管理状态必须两者皆是。
    #[cfg(desktop)]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> StatusBar<R> {
    pub fn show(&self, args: ShowArgs) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("show", args)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            let _ = args;
            Ok(())
        }
    }

    pub fn cancel(&self) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("cancel", ())
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(())
        }
    }

    /// 取走冷启动时点通知携带的导航目标（取出即删）。
    pub fn take_navigation(&self) -> Result<Option<String>, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<NavigationResponse>("takeNavigation", ())
                .map(|r| r.destination)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(None)
        }
    }
}

pub trait StatusBarExt<R: Runtime> {
    fn statusbar(&self) -> &StatusBar<R>;
}

impl<R: Runtime, T: Manager<R>> StatusBarExt<R> for T {
    fn statusbar(&self) -> &StatusBar<R> {
        self.state::<StatusBar<R>>().inner()
    }
}

#[tauri::command]
async fn show<R: Runtime>(app: tauri::AppHandle<R>, args: ShowArgs) -> Result<(), String> {
    app.statusbar().show(args)
}

#[tauri::command]
async fn cancel<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.statusbar().cancel()
}

/// 取走冷启动时点通知携带的导航目标（取出即删）。
#[tauri::command]
async fn take_navigation<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.statusbar().take_navigation()
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("statusbar")
        .invoke_handler(tauri::generate_handler![show, cancel, take_navigation])
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "StatusBarPlugin")?;

            #[cfg(mobile)]
            app.manage(StatusBar { handle });
            #[cfg(desktop)]
            app.manage(StatusBar::<R> {
                _marker: std::marker::PhantomData,
            });

            Ok(())
        })
        .build()
}
