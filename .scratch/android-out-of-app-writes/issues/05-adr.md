# 05：ADR — App 外写入经后台凭据直达 hub

Status: implemented

## 范围

- 新增 `docs/adr/0027-out-of-app-writes-via-background-token.md`，记录：
  - 为什么不做后台副本同步 / 后台运行 JS（ADR-0007 的取舍不变）；
  - 后台凭据从「只读」扩展为三个接口的白名单，而不是另发写凭据；
  - 原生队列作为唯一待办来源、谁先取谁负责，重放靠规则本身幂等（不另建去重表）。
- 在 ADR-0014 和 local-first-v3 issue 09 相关位置追加修订指向；更新 reminder-actions spec story 7 的说明。
- 如有新术语（如 Out-of-app Write），按 `docs/agents/domain.md` 写进 CONTEXT.md。

## Comments

### 2026-10-17 — 完成

- 新增 `docs/adr/0027-out-of-app-writes-via-background-token.md`（含两条被放弃的初版方案：DeviceRequest 去重表、Worker 取走 + 租约）。
- ADR-0014 末尾追加英文修订（与该文件已有修订同语言）。
- local-first-v3 issue 09、reminder-actions spec 的 Comments 追加修订指向。
- CONTEXT.md「同步」一节新增术语 **App 外写入（Out-of-app Write）**。
