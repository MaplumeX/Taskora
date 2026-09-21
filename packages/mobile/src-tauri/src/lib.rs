//! Taskora Android 壳（ADR-0010）：Tauri v2 mobile 薄壳。
//!
//! 与 desktop 同构的 Rust command 面：
//! - `sqlite`：Local Replica 的 rusqlite 适配层（自 desktop 平移）；
//! - `session`：会话令牌的 Android Keystore 加密存储（ADR-0009）；
//! - `app_exit`：返回手势级联的根页退出（back-navigation.ts 调用）。

mod keystore;
mod session;
mod sqlite;

use tauri::Manager;

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
            app_exit
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {});
}
