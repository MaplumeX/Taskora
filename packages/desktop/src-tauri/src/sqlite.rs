//! Tauri 侧 SQLite — Local Replica 的原生存储（ADR-0007）。
//!
//! webview 中的 Engine（`packages/desktop/src/engine/tauri-storage.ts`）
//! 通过 IPC 命令在这条连接上执行 SQL：
//! - `sql_use_db`：按登录用户切换副本文件（多账号隔离）；
//! - `sql_exec`：批量语句（DDL / BEGIN / COMMIT）；
//! - `sql_all`：查询，行以 JSON 对象返回（列为键）；
//! - `sql_run`：写语句，返回受影响行数。
//!
//! 连接按用户惰性打开于应用数据目录的 `taskora-<user>.db`，WAL 模式
//! （登录前不打开任何库；quick-add 不碰 db）。SQLite 文件即用户数据
//! 的可导出载体（数据主权，ADR-0007）。状态注册见 `manage_state`，
//! IPC 命令统一在 `lib.rs` 注册。

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, DatabaseName};
use serde_json::{Map, Number, Value as Json};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// 旧版单用户库（V2 之前）：首个登录用户迁移继承，之后改名为
/// `taskora.db.legacy`，不再被自动使用（多账号不能互事数据）。
const LEGACY_DB: &str = "taskora.db";
const LEGACY_MIGRATED_DB: &str = "taskora.db.legacy";

/// 当前用户的副本连接：`ReplicaDb` 内部状态。
struct CurrentDb {
    user: String,
    conn: Option<Connection>,
}

pub struct ReplicaDb {
    dir: PathBuf,
    current: Mutex<CurrentDb>,
}

impl ReplicaDb {
    fn new(dir: PathBuf) -> Self {
        ReplicaDb {
            dir,
            current: Mutex::new(CurrentDb {
                user: String::new(),
                conn: None,
            }),
        }
    }

    /// 切换到某用户的副本库；重复切换同一用户为 no-op（幂等）。
    fn use_user(&self, user: &str) -> Result<(), String> {
        let mut current = self
            .current
            .lock()
            .map_err(|_| "Replica db lock failed".to_string())?;
        if current.user == user && current.conn.is_some() {
            return Ok(());
        }
        let conn = open_user_connection(&self.dir, user)
            .map_err(|e| format!("failed to open replica db: {e}"))?;
        *current = CurrentDb {
            user: user.to_owned(),
            conn: Some(conn),
        };
        Ok(())
    }

    fn with_conn<T>(
        &self,
        run: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let current = self
            .current
            .lock()
            .map_err(|_| "Replica db lock failed".to_string())?;
        let conn = current
            .conn
            .as_ref()
            .ok_or_else(|| "Replica db not opened (no signed-in user)".to_string())?;
        run(conn)
    }
}

/// user id → 安全文件名片段：只保留 [A-Za-z0-9_-]，其余替换为 '_'。
fn sanitize_user_key(user: &str) -> String {
    user.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn open_user_connection(dir: &Path, user: &str) -> Result<Connection, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("taskora-{}.db", sanitize_user_key(user)));
    migrate_legacy_db(dir, &path)?;
    let conn = Connection::open(&path)?;
    conn.pragma_update(Some(DatabaseName::Main), "journal_mode", "WAL")?;
    conn.pragma_update(Some(DatabaseName::Main), "foreign_keys", "ON")?;
    Ok(conn)
}

/// legacy 一次性迁移：用户库不存在且 `taskora.db` 存在时，复制（含
/// WAL 边车）为该用户库，并把旧主文件改名为 `taskora.db.legacy`，
/// 后续账号不再继承。任一步失败则保留原状（下次重试）。
fn migrate_legacy_db(dir: &Path, user_db: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if user_db.exists() {
        return Ok(());
    }
    let legacy = dir.join(LEGACY_DB);
    if !legacy.exists() {
        return Ok(());
    }
    std::fs::copy(&legacy, user_db)?;
    let wal = dir.join(format!("{LEGACY_DB}-wal"));
    if wal.exists() {
        let _ = std::fs::copy(
            &wal,
            dir.join(format!(
                "{}-wal",
                user_db.file_name().unwrap_or_default().to_string_lossy()
            )),
        );
    }
    std::fs::rename(&legacy, dir.join(LEGACY_MIGRATED_DB))?;
    Ok(())
}

/// 按登录用户切换副本数据库（多账号隔离）。
#[tauri::command]
pub fn sql_use_db(db: tauri::State<ReplicaDb>, user: String) -> Result<(), String> {
    db.use_user(&user)
}

#[tauri::command]
pub fn sql_exec(db: tauri::State<ReplicaDb>, sql: String) -> Result<(), String> {
    db.with_conn(|conn| conn.execute_batch(&sql).map_err(|e| e.to_string()))
}

#[tauri::command]
pub fn sql_all(
    db: tauri::State<ReplicaDb>,
    sql: String,
    params: Vec<Json>,
) -> Result<Vec<Map<String, Json>>, String> {
    db.with_conn(|conn| {
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
    })
}

#[tauri::command]
pub fn sql_run(db: tauri::State<ReplicaDb>, sql: String, params: Vec<Json>) -> Result<i64, String> {
    db.with_conn(|conn| {
        let sql_params: Vec<SqlValue> = params.into_iter().map(json_to_sql).collect();
        let changes = conn
            .execute(&sql, rusqlite::params_from_iter(sql_params.iter()))
            .map_err(|e| e.to_string())?;
        Ok(changes as i64)
    })
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

/// 在 setup 阶段注册 ReplicaDb 状态。
///
/// 注意：`tauri::Builder::setup` 与 `invoke_handler` 都是「替换」语义，
/// 逆置的注册会覆盖先前的 —— 因此本模块不再链 Builder，而是在
/// `lib.rs` 的唯一 setup 中调用此函数；IPC 命令也在 `lib.rs` 的唯一
/// `generate_handler!` 列表里注册（与 session 命令同处）。
pub fn manage_state(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    app.manage(ReplicaDb::new(dir));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn opens_a_database_per_user() {
        let dir = dir();
        let conn = open_user_connection(dir.path(), "user-1").unwrap();
        conn.execute_batch("CREATE TABLE t(x)").unwrap();
        drop(conn);
        assert!(dir.path().join("taskora-user-1.db").exists());
        assert!(!dir.path().join("taskora-user-2.db").exists());
        // 另一用户拿到独立空库
        let other = open_user_connection(dir.path(), "user-2").unwrap();
        assert!(other.prepare("SELECT x FROM t").is_err());
    }

    #[test]
    fn migrates_legacy_db_exactly_once() {
        let dir = dir();
        let legacy = Connection::open(dir.path().join(LEGACY_DB)).unwrap();
        legacy
            .execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (42);")
            .unwrap();
        drop(legacy);

        // 第一个登录的用户继承 legacy 数据
        let conn = open_user_connection(dir.path(), "user-1").unwrap();
        let value: i64 = conn
            .query_row("SELECT x FROM t", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, 42);
        drop(conn);

        // legacy 只迁移一次:原文件改名为 .legacy,不再被自动使用
        assert!(!dir.path().join(LEGACY_DB).exists());
        assert!(dir.path().join(LEGACY_MIGRATED_DB).exists());

        // 第二个账号拿到空库,不继承第一个账号的数据
        let other = open_user_connection(dir.path(), "user-2").unwrap();
        assert!(other.prepare("SELECT x FROM t").is_err());
    }

    #[test]
    fn migration_survives_a_wal_sidecar() {
        let dir = dir();
        let legacy = Connection::open(dir.path().join(LEGACY_DB)).unwrap();
        legacy.pragma_update(None, "journal_mode", "WAL").unwrap();
        legacy
            .execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (7);")
            .unwrap();
        drop(legacy); // WAL checkpoint happens on drop

        let conn = open_user_connection(dir.path(), "user-1").unwrap();
        let value: i64 = conn
            .query_row("SELECT x FROM t", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, 7);
    }

    #[test]
    fn sanitizes_unsafe_user_ids_into_safe_file_names() {
        let dir = dir();
        let conn = open_user_connection(dir.path(), "../evil/id").unwrap();
        drop(conn);
        // 只有 [A-Za-z0-9_-] 保留，其余（含路径分隔符与点）替换为 '_'
        assert!(dir.path().join("taskora-___evil_id.db").exists());
    }
}
