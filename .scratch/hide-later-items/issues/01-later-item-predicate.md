# 01: Later Item 判定函数

Status: done

## 内容

`@taskora/shared` 新增 `laterTaskKind(task, todayKey, legacyTimeZone) → 'scheduled' | 'someday' | null` 与 `isLaterTask`，与 `laterProjectKind` 同口径（未了结、未进 Trash；Start 为 SOMEDAY，或计划日期晚于 `todayKey`）。`@taskora/api` 补对应 hook（同 `useLaterProjectKind`，按账号时区给 todayKey、跨天刷新）。

## 验收标准

- [x] Someday → someday；明天 → scheduled；今天 / 已过 / 无日期 → null
- [x] 已了结、已进 Trash → null
- [x] 跨时区边界用例
