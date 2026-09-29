# 08 数据增长：Logbook 按需、bootstrap 分页、登记清理

Status: ready-for-agent

## Problem

- 每台设备保存全部历史，Logbook 只增不减。
- bootstrap 一次性整包返回全部数据（新设备、超过 30 天未同步、升级后各一次），数据量大时移动端有内存与超时风险。
- 删除登记（设备 `_compacted`、hub `CompactedEntity`）永不清理。

## Design

- **bootstrap 分页**：快照按实体、按 id 游标分页；仍在第一页前固定 cursor fence。设备端分页写入临时表，全部到齐后在一个事务里替换（保持「重建期间读不到半份数据」）。
- **Logbook 分层**：副本只保留最近 N 个月的已了结任务；更早的 Logbook 由 UI 在滚动到底时从 hub 分页拉取（只读、不进副本）。LWW 不受影响：被裁掉的是已了结、未修改的行，若 hub 上后来被修改会随变更日志回到副本。
- **登记清理**：删除登记只需覆盖「仍可能推送迟到写的设备」。在所有设备游标都越过登记时刻（`Device.lastSeenAt` + 日志保留期）后清理；超过保留期的设备会走 bootstrap，bootstrap 带当前登记，不会复活。

## Acceptance

- 10 万行任务的账号 bootstrap 峰值内存有上限；新设备首屏在第一页到达后即可渲染。
- 副本大小随时间有上界（可配置）。

## Comments
