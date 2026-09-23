//! Taskora Android 壳（ADR-0010）：Tauri v2 mobile 薄壳。
//!
//! 与 desktop 同构的 Rust command 面：
//! - `sqlite`：Local Replica 的 rusqlite 适配层（自 desktop 平移）；
//! - `session`：会话令牌的应用私有目录明文存储（ADR-0011；Keystore
//!   JNI 桥已移除，见 ADR-0011 的取舍记录）；
//! - `app_exit`：返回手势级联的根页退出（back-navigation.ts 调用）。

mod session;
mod sqlite;

use tauri::Manager;

/// 跳转到本应用的系统通知设置页（Reminders spec：授权被拒后的引导）。
/// 仅 Android；其它目标（测试编译）返回不支持。
#[tauri::command]
fn open_notification_settings() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return android_settings::open_app_notification_settings();
    }
    #[cfg(not(target_os = "android"))]
    Err("unsupported platform".into())
}

/// Android 通知设置页 intent（JNI）：tao 启动时以 Application Context
/// 初始化 ndk-context，据此拿 Context/JavaVM 发
/// android.settings.APP_NOTIFICATION_SETTINGS（携带 app package extra，
/// Application Context 启 Activity 需 NEW_TASK 标志）。
#[cfg(target_os = "android")]
mod android_settings {
    use jni::objects::JObject;

    pub fn open_app_notification_settings() -> Result<(), String> {
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        let context = unsafe { JObject::from_raw(ctx.context().cast()) };

        // Intent intent = new Intent("android.settings.APP_NOTIFICATION_SETTINGS");
        let action = env
            .new_string("android.settings.APP_NOTIFICATION_SETTINGS")
            .map_err(|e| e.to_string())?;
        let intent = env
            .new_object(
                "android/content/Intent",
                "(Ljava/lang/String;)V",
                &[(&action).into()],
            )
            .map_err(|e| e.to_string())?;

        // intent.putExtra("android.provider.extra.APP_PACKAGE", getPackageName())
        // （API 26+ 口径；API 24/25 的 app_package/app_uid 已少见，接受降级）
        let package_name = env
            .call_method(&context, "getPackageName", "()Ljava/lang/String;", &[])
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;
        let extra_key = env
            .new_string("android.provider.extra.APP_PACKAGE")
            .map_err(|e| e.to_string())?;
        env.call_method(
            &intent,
            "putExtra",
            "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
            &[(&extra_key).into(), (&package_name).into()],
        )
        .map_err(|e| e.to_string())?;

        // intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        const FLAG_ACTIVITY_NEW_TASK: i32 = 0x1000_0000;
        env.call_method(
            &intent,
            "addFlags",
            "(I)Landroid/content/Intent;",
            &[FLAG_ACTIVITY_NEW_TASK.into()],
        )
        .map_err(|e| e.to_string())?;

        // context.startActivity(intent)
        env.call_method(
            &context,
            "startActivity",
            "(Landroid/content/Intent;)V",
            &[(&intent).into()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// 根页返回 = 退出 App（Android 返回手势级联的最后一级）。
/// onBackButtonPress 注册后 Tauri 不再执行默认返回行为（PR #14133），
/// 退出路径由壳层显式选择。
#[tauri::command]
fn app_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 系统通知（Reminders spec）：系统级定时通知（App 关闭仍触发）。
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Local Replica 目录注册（ADR-0007）。Builder 的 setup 与
            // invoke_handler 都是「替换」语义，全部命令集中在下方唯一的
            // generate_handler! 列表注册（desktop v0.4.0 的教训）。
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
            sqlite::manage_state(app)?;
            session::manage_state(app, data_dir)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sqlite::sql_exec,
            sqlite::sql_all,
            sqlite::sql_run,
            sqlite::sql_use_db,
            session::session_read,
            session::session_write,
            session::session_clear,
            open_notification_settings,
            app_exit
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {});
}
