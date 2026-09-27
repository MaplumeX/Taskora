//! Taskora 安卓 Reminder 投递本地插件（ADR-0014，reminders issue 03）。
//!
//! JS 只负责计算规则（期望集），经 `sync` 整体交付；原生侧持久化计划、
//! 自行差量、设置精确闹钟、开机/升级/启动后重新设置、到点发通知，并管理
//! 渠道与权限。结构同 `tauri-plugin-statusbar`：桌面端（测试编译）为 no-op。

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.taskora.mobile.reminders";

/// 期望集中的一条提醒（文案由 JS 按当前语言组装）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderEntry {
    /// 稳定 key（`reminder:<taskId>`），原生据此分配并复用通知 id。
    pub key: String,
    /// 触发时刻（epoch ms，账号时区已在 JS 侧换算）。
    pub fire_at: i64,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncArgs {
    /// 完整期望集（不是增量）；空集 = 当前没有未来提醒。
    pub reminders: Vec<ReminderEntry>,
    /// reminders 渠道名（渠道创建后名字可随语言更新，importance 不变）。
    pub channel_name: String,
}

/// 投递可靠性状态（设置页「提醒可靠性」区展示）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderStatus {
    pub notifications: bool,
    pub channel_enabled: bool,
    pub exact_alarms: bool,
    pub battery_unrestricted: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(desktop, allow(dead_code))]
struct PermissionResponse {
    granted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(desktop, allow(dead_code))]
struct OpenSettingsArgs {
    target: String,
}

/// Reminder 投递的原生侧句柄。
pub struct Reminders<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    /// `fn() -> R` 无条件 Send + Sync，受管理状态必须两者皆是。
    #[cfg(desktop)]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> Reminders<R> {
    pub fn sync(&self, args: SyncArgs) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("sync", args)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            let _ = args;
            Ok(())
        }
    }

    pub fn clear(&self) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("clear", ())
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(())
        }
    }

    pub fn status(&self) -> Result<ReminderStatus, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<ReminderStatus>("status", ())
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(ReminderStatus::default())
        }
    }

    pub fn request_permission(&self) -> Result<bool, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<PermissionResponse>("requestPermission", ())
                .map(|r| r.granted)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(false)
        }
    }

    pub fn open_settings(&self, target: String) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("openSettings", OpenSettingsArgs { target })
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            let _ = target;
            Err("unsupported platform".into())
        }
    }
}

pub trait RemindersExt<R: Runtime> {
    fn reminders(&self) -> &Reminders<R>;
}

impl<R: Runtime, T: Manager<R>> RemindersExt<R> for T {
    fn reminders(&self) -> &Reminders<R> {
        self.state::<Reminders<R>>().inner()
    }
}

#[tauri::command]
async fn sync<R: Runtime>(app: tauri::AppHandle<R>, args: SyncArgs) -> Result<(), String> {
    app.reminders().sync(args)
}

#[tauri::command]
async fn clear<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.reminders().clear()
}

#[tauri::command]
async fn status<R: Runtime>(app: tauri::AppHandle<R>) -> Result<ReminderStatus, String> {
    app.reminders().status()
}

#[tauri::command]
async fn request_permission<R: Runtime>(app: tauri::AppHandle<R>) -> Result<bool, String> {
    app.reminders().request_permission()
}

/// `target`：`exact-alarm` | `battery` | `autostart`（通知设置页仍走壳层的
/// `open_notification_settings`）。
#[tauri::command]
async fn open_settings<R: Runtime>(app: tauri::AppHandle<R>, target: String) -> Result<(), String> {
    app.reminders().open_settings(target)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("reminders")
        .invoke_handler(tauri::generate_handler![
            sync,
            clear,
            status,
            request_permission,
            open_settings
        ])
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "RemindersPlugin")?;

            #[cfg(mobile)]
            app.manage(Reminders { handle });
            #[cfg(desktop)]
            app.manage(Reminders::<R> {
                _marker: std::marker::PhantomData,
            });

            Ok(())
        })
        .build()
}
