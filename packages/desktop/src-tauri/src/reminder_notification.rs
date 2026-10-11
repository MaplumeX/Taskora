//! Reminder 通知（reminder-actions spec）：带操作按钮的系统通知。
//!
//! `tauri-plugin-notification` 在桌面端既没有按钮也拿不到点击回调，因此
//! reminder 的发送绕开插件，直接用插件依赖树里已有的平台 crate：
//! - Windows：`windows` 的 WinRT toast（按钮 + `Activated`，tag 撤回）；
//! - Linux：`notify-rust` 的 XDG actions（后台线程 `wait_for_action`）；
//! - macOS：`mac-notification-sys`（主按钮下拉 + 后台线程阻塞 `send`）。
//!
//! 已发出的通知在别处被处理（任务了结、改期、清除提醒）后，前端调用
//! `withdraw_reminder` 撤下（按 taskId 定位）。macOS 的 `mac-notification-sys`
//! 没有撤回 API，该平台为 no-op。
//!
//! 用户的选择以 `reminder-action` 事件交给前端，由 JS 按 Reminder Action
//! 规则应用（规则只在 JS）。点击正文先把主窗口带到前台，再发 `open`。
//! 桌面是 runtime 模式：通知只在 App 运行时发出，回调总有进程接收；App
//! 退出后仍留在通知中心的旧通知，点击行为尽力而为（spec Out of Scope）。
//! 权限查询与设置跳转仍走插件（见前端 tauri-notification-shell）。

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// 前端订阅的事件名。
pub const ACTION_EVENT: &str = "reminder-action";

/// 通知按钮文案（前端按当前语言提供）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(any(windows, unix)), allow(dead_code))]
pub struct ReminderLabels {
    pub complete: String,
    pub snooze15: String,
    pub snooze60: String,
    pub snooze_tomorrow: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderPayload {
    pub task_id: String,
    /// 通知对应的触发时刻（epoch ms），随操作回传供 JS 做过期校验。
    pub fire_at: i64,
    pub title: String,
    /// 可能含第二行（备注首行）。
    pub body: String,
    pub labels: ReminderLabels,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderActionEvent {
    task_id: String,
    /// `open` | `complete` | `snooze15` | `snooze60` | `snoozeTomorrow`
    action: &'static str,
    fired_fire_at: i64,
    tapped_at: i64,
}

/// 按钮标识（Windows 按钮 arguments / XDG action id）→ 事件里的 action。
#[cfg_attr(target_os = "macos", allow(dead_code))]
fn action_from_id(id: &str) -> Option<&'static str> {
    match id {
        "complete" => Some("complete"),
        "snooze15" => Some("snooze15"),
        "snooze60" => Some("snooze60"),
        "snoozeTomorrow" => Some("snoozeTomorrow"),
        _ => None,
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 把用户的选择交给前端；点击正文时先唤出主窗口。
fn dispatch(app: &AppHandle, task_id: &str, fired_fire_at: i64, action: &'static str) {
    if action == "open" {
        crate::show_main_window(app);
    }
    let _ = app.emit(
        ACTION_EVENT,
        ReminderActionEvent {
            task_id: task_id.to_owned(),
            action,
            fired_fire_at,
            tapped_at: now_ms(),
        },
    );
}

/// 发送一条 reminder 通知。平台实现不阻塞调用方（需要等待回调的平台
/// 在后台线程等待）。
#[tauri::command]
pub fn show_reminder(app: AppHandle, payload: ReminderPayload) -> Result<(), String> {
    imp::show(app, payload)
}

/// 撤下该任务已发出的 reminder 通知；通知已不在时不报错。
#[tauri::command]
pub fn withdraw_reminder(app: AppHandle, task_id: String) -> Result<(), String> {
    imp::withdraw(app, &task_id)
}

#[cfg(windows)]
mod imp {
    use super::{action_from_id, dispatch, ReminderPayload};
    use tauri::AppHandle;
    use windows::core::{IInspectable, Interface, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{
        ToastActivatedEventArgs, ToastNotification, ToastNotificationManager,
    };

    /// 未安装（`cargo run`）时借用的 AppUserModelID。
    const POWERSHELL_APP_ID: &str =
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
    /// 全部 reminder toast 同一分组；tag = taskId（UUID，不超过 64 字符的上限）。
    const GROUP: &str = "reminders";

    /// 与插件同一口径：安装版用 bundle identifier 作 AppUserModelID；
    /// `cargo run`（target\debug|release）下该 AUMID 未注册，借用 PowerShell 的。
    fn app_user_model_id(app: &AppHandle) -> String {
        let sep = std::path::MAIN_SEPARATOR;
        let in_target_dir = tauri::utils::platform::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.display().to_string()))
            .map(|dir| {
                dir.ends_with(&format!("{sep}target{sep}debug"))
                    || dir.ends_with(&format!("{sep}target{sep}release"))
            })
            .unwrap_or(false);
        if in_target_dir {
            POWERSHELL_APP_ID.to_owned()
        } else {
            app.config().identifier.clone()
        }
    }

    fn escape(text: &str) -> String {
        text.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    /// 点正文时 arguments 为空；点按钮时为按钮的 arguments。
    fn activated_arguments(args: &Option<IInspectable>) -> Option<String> {
        let args = args.as_ref()?.cast::<ToastActivatedEventArgs>().ok()?;
        let arguments = args.Arguments().ok()?;
        (!arguments.is_empty()).then(|| arguments.to_string())
    }

    pub fn show(app: AppHandle, payload: ReminderPayload) -> Result<(), String> {
        show_toast(&app, payload).map_err(|e| e.to_string())
    }

    fn show_toast(app: &AppHandle, payload: ReminderPayload) -> windows::core::Result<()> {
        let mut lines = payload.body.splitn(2, '\n');
        let line1 = lines.next().unwrap_or_default();
        let line2 = lines
            .next()
            .map(|line| format!("<text>{}</text>", escape(line)))
            .unwrap_or_default();
        let labels = &payload.labels;
        let button = |label: &str, id: &str| {
            format!(r#"<action content="{}" arguments="{id}"/>"#, escape(label))
        };
        // toast 最多 5 个按钮：四个操作全部平铺。Reminder 场景在用户处理前
        // 一直停留在屏幕上。不写 <audio>：由系统播放默认提示音。
        let xml = format!(
            r#"<toast scenario="reminder"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text>{line2}</binding></visual><actions>{}{}{}{}</actions></toast>"#,
            escape(&payload.title),
            escape(line1),
            button(&labels.complete, "complete"),
            button(&labels.snooze15, "snooze15"),
            button(&labels.snooze60, "snooze60"),
            button(&labels.snooze_tomorrow, "snoozeTomorrow"),
        );
        let document = XmlDocument::new()?;
        document.LoadXml(&HSTRING::from(xml))?;
        let toast = ToastNotification::CreateToastNotification(&document)?;
        toast.SetTag(&HSTRING::from(payload.task_id.as_str()))?;
        toast.SetGroup(&HSTRING::from(GROUP))?;

        let handle = app.clone();
        let task_id = payload.task_id.clone();
        let fire_at = payload.fire_at;
        toast.Activated(&TypedEventHandler::new(move |_, args| {
            let action = match activated_arguments(&args) {
                None => Some("open"),
                Some(id) => action_from_id(&id),
            };
            if let Some(action) = action {
                dispatch(&handle, &task_id, fire_at, action);
            }
            Ok(())
        }))?;

        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_user_model_id(app)))?
            .Show(&toast)
    }

    pub fn withdraw(app: AppHandle, task_id: &str) -> Result<(), String> {
        ToastNotificationManager::History()
            .and_then(|history| {
                history.RemoveGroupedTagWithId(
                    &HSTRING::from(task_id),
                    &HSTRING::from(GROUP),
                    &HSTRING::from(app_user_model_id(&app)),
                )
            })
            .map_err(|e| e.to_string())
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod imp {
    use super::{action_from_id, dispatch, ReminderPayload};
    use std::collections::HashMap;
    use std::sync::{Mutex, MutexGuard, OnceLock};
    use tauri::AppHandle;

    /// 屏幕上的 reminder 通知：taskId → 通知服务分配的 id（撤回用）。
    static SHOWN: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();

    fn shown() -> MutexGuard<'static, HashMap<String, u32>> {
        SHOWN
            .get_or_init(Default::default)
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn show(app: AppHandle, payload: ReminderPayload) -> Result<(), String> {
        // wait_for_action 阻塞到通知被处理或关闭：每条通知一个线程（一天
        // 至多几条）。守护进程不支持 actions 时按钮不显示；GNOME Shell 最多
        // 显示前 3 个按钮。
        std::thread::spawn(move || {
            let labels = &payload.labels;
            let mut notification = notify_rust::Notification::new();
            notification
                .summary(&payload.title)
                .body(&payload.body)
                .auto_icon()
                .action("default", "")
                .action("complete", &labels.complete)
                .action("snooze15", &labels.snooze15)
                .action("snooze60", &labels.snooze60)
                .action("snoozeTomorrow", &labels.snooze_tomorrow);
            match notification.show() {
                Ok(handle) => {
                    let id = handle.id();
                    shown().insert(payload.task_id.clone(), id);
                    handle.wait_for_action(|action_id| {
                        let action = if action_id == "default" {
                            Some("open")
                        } else {
                            action_from_id(action_id)
                        };
                        if let Some(action) = action {
                            dispatch(&app, &payload.task_id, payload.fire_at, action);
                        }
                    });
                    // 已被处理或关闭；同一任务若已发出更新的通知则保留其记录。
                    let mut shown = shown();
                    if shown.get(&payload.task_id) == Some(&id) {
                        shown.remove(&payload.task_id);
                    }
                }
                Err(error) => eprintln!("[reminders] notification failed: {error}"),
            }
        });
        Ok(())
    }

    pub fn withdraw(_app: AppHandle, task_id: &str) -> Result<(), String> {
        let Some(id) = shown().remove(task_id) else {
            return Ok(());
        };
        // 关闭后等待中的线程收到 NotificationClosed，随之退出。
        zbus::blocking::Connection::session()
            .and_then(|connection| {
                connection.call_method(
                    Some("org.freedesktop.Notifications"),
                    "/org/freedesktop/Notifications",
                    Some("org.freedesktop.Notifications"),
                    "CloseNotification",
                    &(id,),
                )
            })
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use super::{dispatch, ReminderPayload};
    use mac_notification_sys::{MainButton, Notification, NotificationResponse};
    use tauri::AppHandle;

    pub fn show(app: AppHandle, payload: ReminderPayload) -> Result<(), String> {
        // 与插件同一口径：开发运行未打包，借用 Terminal 的身份投递。
        let bundle = if tauri::is_dev() {
            "com.apple.Terminal".to_owned()
        } else {
            app.config().identifier.clone()
        };
        // 只能设置一次（插件发通知时也会设置同一个值）；重复设置报错忽略。
        let _ = mac_notification_sys::set_application(&bundle);

        // NSUserNotification 只有一个主按钮（可带下拉）和一个关闭按钮；划走
        // 通知也会回报「关闭」，因此关闭按钮不能承载「完成」。主按钮为完成，
        // 下拉里是完成与三个 Snooze；send 阻塞到用户处理，放后台线程。
        std::thread::spawn(move || {
            let labels = &payload.labels;
            let options = [
                labels.complete.as_str(),
                labels.snooze15.as_str(),
                labels.snooze60.as_str(),
                labels.snooze_tomorrow.as_str(),
            ];
            let response = Notification::new()
                .title(&payload.title)
                .message(&payload.body)
                .main_button(MainButton::DropdownActions(&labels.complete, &options))
                .default_sound()
                .send();
            let action = match response {
                Ok(NotificationResponse::Click) => Some("open"),
                // 回报的是被点按钮的文案：按文案反查（各文案互不相同）。
                Ok(NotificationResponse::ActionButton(label)) => {
                    if label == labels.complete {
                        Some("complete")
                    } else if label == labels.snooze15 {
                        Some("snooze15")
                    } else if label == labels.snooze60 {
                        Some("snooze60")
                    } else if label == labels.snooze_tomorrow {
                        Some("snoozeTomorrow")
                    } else {
                        None
                    }
                }
                Ok(_) => None,
                Err(error) => {
                    eprintln!("[reminders] notification failed: {error}");
                    None
                }
            };
            if let Some(action) = action {
                dispatch(&app, &payload.task_id, payload.fire_at, action);
            }
        });
        Ok(())
    }

    /// NSUserNotification 的封装没有撤回 API：已失效的通知留在通知中心，
    /// 点它的按钮会被前端按过期操作丢弃。
    pub fn withdraw(_app: AppHandle, _task_id: &str) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(not(any(windows, unix)))]
mod imp {
    use super::ReminderPayload;
    use tauri::AppHandle;

    pub fn show(_app: AppHandle, _payload: ReminderPayload) -> Result<(), String> {
        Err("unsupported platform".into())
    }

    pub fn withdraw(_app: AppHandle, _task_id: &str) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn button_ids_map_to_actions() {
        assert_eq!(action_from_id("complete"), Some("complete"));
        assert_eq!(action_from_id("snooze15"), Some("snooze15"));
        assert_eq!(action_from_id("snooze60"), Some("snooze60"));
        assert_eq!(action_from_id("snoozeTomorrow"), Some("snoozeTomorrow"));
        assert_eq!(action_from_id("__closed"), None);
        assert_eq!(action_from_id(""), None);
    }

    #[test]
    fn payload_deserializes_from_camel_case() {
        let payload: ReminderPayload = serde_json::from_value(serde_json::json!({
            "taskId": "t1",
            "fireAt": 1_770_000_000_000_i64,
            "title": "写周报",
            "body": "09:00 · 工作\n先看数据",
            "labels": {
                "complete": "完成",
                "snooze": "稍后提醒",
                "snooze15": "15 分钟后",
                "snooze60": "1 小时后",
                "snoozeTomorrow": "明天",
                "snoozeMore": "稍后…"
            }
        }))
        .unwrap();
        assert_eq!(payload.task_id, "t1");
        assert_eq!(payload.labels.snooze_tomorrow, "明天");
    }

    #[test]
    fn action_event_serializes_to_camel_case() {
        let value = serde_json::to_value(ReminderActionEvent {
            task_id: "t1".into(),
            action: "snooze15",
            fired_fire_at: 1,
            tapped_at: 2,
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({ "taskId": "t1", "action": "snooze15", "firedFireAt": 1, "tappedAt": 2 })
        );
    }
}
