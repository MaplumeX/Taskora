//! Taskora 安卓 Reminder 投递本地插件（ADR-0014，reminders issue 03）。
//!
//! JS 只负责计算规则（期望集），经 `sync` 整体交付；原生侧持久化计划、
//! 自行差量、设置精确闹钟、开机/升级/启动后重新设置、到点发通知，并管理
//! 渠道与权限。App 未打开时，原生的后台周期任务取回 hub 按同一套规则算好
//! 的计划（`configure_background`，local-first-v3 issue 09）。结构同 `tauri-plugin-statusbar`：桌面端（测试编译）为 no-op。

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
    /// 所属任务（通知操作与点击跳转用，reminder-actions spec）。
    pub task_id: String,
    /// 触发时刻（epoch ms，账号时区已在 JS 侧换算）。
    pub fire_at: i64,
    /// 触发日 + 1 的同一时刻：App 未运行时点「明天」临时重设闹钟用。
    pub snooze_tomorrow_at: i64,
    pub title: String,
    pub body: String,
}

/// 通知按钮文案（JS 按当前语言提供，原生随计划持久化）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionLabels {
    pub complete: String,
    pub snooze: String,
    pub snooze15: String,
    pub snooze60: String,
    pub snooze_tomorrow: String,
    pub snooze_more: String,
}

/// 原生排队的一次通知操作（App 进程不在时点按钮，JS 下次运行时应用）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingAction {
    pub task_id: String,
    /// `complete` | `snooze15` | `snooze60` | `snoozeTomorrow`
    pub action: String,
    /// 通知对应的触发时刻（epoch ms），JS 据此做过期校验。
    pub fired_fire_at: i64,
    /// 点击时刻（epoch ms）。
    pub tapped_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[cfg_attr(desktop, allow(dead_code))]
struct PendingActionsResponse {
    actions: Vec<PendingAction>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(desktop, allow(dead_code))]
struct LaunchTaskResponse {
    task_id: Option<String>,
}

/// 计划依据的副本状态（local-first-v3 issue 09）：原生据此在 JS 的计划与
/// 后台取回的 hub 计划之间取较新者。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanBasis {
    /// 副本已拉到的 hub 变更日志位置。
    pub cursor: i64,
    /// Outbox 里还有未推送的本地写。
    pub pending_local: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncArgs {
    /// 完整期望集（不是增量）；空集 = 当前没有未来提醒。
    pub reminders: Vec<ReminderEntry>,
    /// reminders 渠道名（渠道创建后名字可随语言更新，importance 不变）。
    pub channel_name: String,
    pub labels: ActionLabels,
    pub basis: PlanBasis,
}

/// 后台同步的配置（local-first-v3 issue 09）：hub 的提醒计划地址与设备的
/// 只读后台凭据。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureBackgroundArgs {
    pub plan_url: String,
    pub token: String,
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

    pub fn configure_background(&self, args: ConfigureBackgroundArgs) -> Result<(), String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<()>("configureBackground", args)
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

    pub fn take_pending_actions(&self) -> Result<Vec<PendingAction>, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<PendingActionsResponse>("takePendingActions", ())
                .map(|r| r.actions)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(Vec::new())
        }
    }

    pub fn take_launch_task(&self) -> Result<Option<String>, String> {
        #[cfg(mobile)]
        {
            self.handle
                .run_mobile_plugin::<LaunchTaskResponse>("takeLaunchTask", ())
                .map(|r| r.task_id)
                .map_err(|e| e.to_string())
        }
        #[cfg(desktop)]
        {
            Ok(None)
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

/// 设备注册取回后台凭据后调用：保存并确保后台周期任务存在。
#[tauri::command]
async fn configure_background<R: Runtime>(
    app: tauri::AppHandle<R>,
    args: ConfigureBackgroundArgs,
) -> Result<(), String> {
    app.reminders().configure_background(args)
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

/// 取走原生排队的通知操作（取出即删）。
#[tauri::command]
async fn take_pending_actions<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<PendingAction>, String> {
    app.reminders().take_pending_actions()
}

/// 取走点通知正文启动/唤回 App 时携带的任务 id（取出即删）。
#[tauri::command]
async fn take_launch_task<R: Runtime>(app: tauri::AppHandle<R>) -> Result<Option<String>, String> {
    app.reminders().take_launch_task()
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
            open_settings,
            take_pending_actions,
            take_launch_task,
            configure_background
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
