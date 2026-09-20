//! Tauri 侧 SQLite — Local Replica 的原生存储（ADR-0007）。
//!
//! webview 中的 Engine（`packages/desktop/src/engine/tauri-storage.ts`）
//! 通过三个 IPC 命令在这条连接上执行 SQL：
//! - `sql_exec`：批量语句（DDL / BEGIN / COMMIT）；
//! - `sql_all`：查询，行以 JSON 对象返回（列为键）；
//! - `sql_run`：写语句，返回受影响行数。
//!
//! 连接打开于应用数据目录的 `taskora.db`，WAL 模式。SQLite 文件即用户
//! 数据的可导出载体（数据主权是副产品收益）。

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, DatabaseName};
use serde_json::{Map, Number, Value as Json};
use std::sync::Mutex;
use tauri::Manager;

pub struct ReplicaDb {
    conn: Mutex<Connection>,
}

fn open_replica_db(app: &tauri::AppHandle) -> Result<ReplicaDb, Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("taskora.db");
    let conn = Connection::open(&path)?;
    conn.pragma_update(Some(DatabaseName::Main), "journal_mode", "WAL")?;
    conn.pragma_update(Some(DatabaseName::Main), "foreign_keys", "ON")?;
    Ok(ReplicaDb {
        conn: Mutex::new(conn),
    })
}

#[tauri::command]
pub fn sql_exec(db: tauri::State<ReplicaDb>, sql: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(&sql).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sql_all(
    db: tauri::State<ReplicaDb>,
    sql: String,
    params: Vec<Json>,
) -> Result<Vec<Map<String, Json>>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut statement = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let columns: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();
    let sql_params: Vec<SqlValue> = params.into_iter().map(json_to_sql).collect();
    let mut rows = statement
        .query(rusqlite::params_from_iter(sql_params.iter()))
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut object = Map::with_capacity(columns.len());
        for (index, name) in columns.iter().enumerate() {
            let value = match row.get_ref(index).map_err(|e| e.to_string())? {
                rusqlite::types::ValueRef::Null => Json::Null,
                rusqlite::types::ValueRef::Integer(i) => Json::Number(Number::from(i)),
                rusqlite::types::ValueRef::Real(f) => {
                    Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null)
                }
                rusqlite::types::ValueRef::Text(t) => {
                    Json::String(String::from_utf8_lossy(t).to_string())
                }
                rusqlite::types::ValueRef::Blob(_) => Json::Null, // 副本不使用 BLOB
            };
            object.insert(name.clone(), value);
        }
        result.push(object);
    }
    Ok(result)
}

#[tauri::command]
pub fn sql_run(
    db: tauri::State<ReplicaDb>,
    sql: String,
    params: Vec<Json>,
) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let sql_params: Vec<SqlValue> = params.into_iter().map(json_to_sql).collect();
    let changes = conn
        .execute(&sql, rusqlite::params_from_iter(sql_params.iter()))
        .map_err(|e| e.to_string())?;
    Ok(changes as i64)
}

fn json_to_sql(value: Json) -> SqlValue {
    match value {
        Json::Null => SqlValue::Null,
        Json::Bool(b) => SqlValue::Integer(if b { 1 } else { 0 }),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                n.as_f64().map(SqlValue::Real).unwrap_or(SqlValue::Null)
            }
        }
        Json::String(s) => SqlValue::Text(s),
        // Engine 对复合值（tagIds 等）自行 JSON 序列化后再绑定
        _ => SqlValue::Null,
    }
}

/// 在 builder 上注册 replica DB 与三个 SQL 命令。
pub fn install(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .setup(|app| {
            let db = open_replica_db(app.handle())
                .map_err(|e| format!("failed to open replica db: {e}"))?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![sql_exec, sql_all, sql_run])
}
