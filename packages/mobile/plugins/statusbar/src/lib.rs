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

/// 快速添加落库失败的一次性通知（quick-add-android issue 01）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickAddFailedArgs {
    /// 通知标题（「未能添加任务」）。
    pub title: String,
    /// 通知正文：任务标题，用户据此重新输入。
    pub text: String,
    /// 失败通知渠道名（DEFAULT 渠道，与常驻通知的 LOW 渠道分开）。
    pub channel_name: String,
}

/// 点通知本体携带的导航目标（issue 03）：`today` 或缺失。
#[derive(Debug, Clone, Default, Deserialize)]
#[cfg_attr(desktop, allow(dead_code))]
struct NavigationResponse {
    destination: Option<String>,
}

/// 快速添加浮层的数据快照（quick-add-android issue 02）：JS 算好的 JSON 原样落盘。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickAddDataArgs {
    pub data: String,
}

/// 排队的快速添加提交（每项是浮层送来的草稿 JSON 字符串）。
#[derive(Debug, Clone, Default, Deserialize)]
#[cfg_attr(desktop, allow(dead_code))]
struct PendingQuickAddsResponse {
    items: Vec<String>,
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

    pub fn set_quick_add_data(&self, args: QuickAddDataArgs) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("setQuickAddData", args)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            let _ = args;
            Ok(())
        }
    }

    /// 取走排队的快速添加提交（取出即删，按提交顺序）。
    pub fn take_pending_quick_adds(&self) -> Result<Vec<String>, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<PendingQuickAddsResponse>("takePendingQuickAdds", ())
                .map(|r| r.items)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(Vec::new())
        }
    }

    pub fn notify_quick_add_failed(&self, args: QuickAddFailedArgs) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("notifyQuickAddFailed", args)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            let _ = args;
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

/// 写入快速添加浮层的数据快照（状态栏每次发布后由 JS 调用）。
#[tauri::command]
async fn set_quick_add_data<R: Runtime>(
    app: tauri::AppHandle<R>,
    args: QuickAddDataArgs,
) -> Result<(), String> {
    app.statusbar().set_quick_add_data(args)
}

/// 取走排队的快速添加提交（JS 注册监听后与收到 quick-add-available 时调用）。
#[tauri::command]
async fn take_pending_quick_adds<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<String>, String> {
    app.statusbar().take_pending_quick_adds()
}

#[tauri::command]
async fn notify_quick_add_failed<R: Runtime>(
    app: tauri::AppHandle<R>,
    args: QuickAddFailedArgs,
) -> Result<(), String> {
    app.statusbar().notify_quick_add_failed(args)
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
        .invoke_handler(tauri::generate_handler![
            show,
            cancel,
            take_navigation,
            take_pending_quick_adds,
            set_quick_add_data,
            notify_quick_add_failed
        ])
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
