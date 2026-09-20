# 多账号 Local Replica 隔离:按用户分库

Status: resolved

## Problem

`sqlite.rs` 打开的是固定路径 `taskora.db`,与登录用户无关;而
`desktop-engine.ts` 登出只丢弃 deviceId、保留数据文件。切到另一个
账号时:

- 旧账号的 Sync Cursor 残留 → 新账号首次 pull 拿到错乱增量(靠 hub
  resync 机制碰巧自愈);
- 更糟:旧账号未推的 Outbox 条目被推给新账号,被 hub 归属校验拒绝
  → flush 报错,同步卡在 offline。

## Solution

- Rust:新增 `sql_use_db(user)` IPC 命令;副本连接按用户惰性打开,
  文件为应用数据目录下 `taskora-<user>.db`(user id 消毒为安全文件名)。
- legacy 迁移:用户库不存在且旧 `taskora.db` 存在时,复制为该用户库,
  并将旧文件改名为 `taskora.db.legacy`(只迁移一次,第二个账号拿到
  的是空库,不会继承第一个账号的数据)。
- JS:`tauri-storage.ts` 暴露 `useUserReplicaDb(userId)`;
  `desktop-engine.ts` 的 `startEngine` 在 `openEngine` 前调用。
  登录哪个账号,Engine 就读写哪个账号的副本。
- 数据主权语义不变:每用户一个 SQLite 文件,登出仍不删除。

## Testing seams

- Rust 单测(tempdir):按用户打开 → 创建对应文件;legacy 一次性
  迁移(第二个用户不继承);user id 消毒。
- vitest(mock `__TAURI_INTERNALS__.invoke`,先例:secure-token-store.test):
  `useUserReplicaDb` 调 `sql_use_db` 且带 user 参数。
- startEngine 接线(typecheck + 手动验收覆盖,不新增接缝)。

## Comments

## Answer

已实现:`sqlite.rs` 新增 `sql_use_db(user)` IPC,连接按用户惰性打开
`taskora-<sanitized-userId>.db`(WAL);legacy `taskora.db` 只被首个登录
用户一次性复制继承并改名 `taskora.db.legacy`。JS 侧
`useUserReplicaDb` + `startEngine` 接线。测试:Rust 4 例(分库/一次性
迁移/WAL 边车/文件名消毒),vitest 2 例(mock invoke)。
