# Hub 回报版本与协议范围

Status: resolved

## 内容

- `packages/backend/src/health/health.controller.ts`：`GET /health` 增加 `version`、`protocolVersion`（`SYNC_PROTOCOL_VERSION`）、`minProtocolVersion`（`MIN_SYNC_PROTOCOL_VERSION`）。保持不需要登录。
- 版本读 backend 的 `package.json`（src/ 与 dist/ 下都是 `../../package.json`），Dockerfile runtime 阶段复制它。不用构建参数 `VERSION`：main 构建时它是 `dev`，不能当更新目标。
- `MIN_SYNC_PROTOCOL_VERSION` 移到 `src/sync/min-protocol.ts`（`sync.controller` 再导出），避免 health 为此加载同步模块与 Prisma。
- 旧客户端只检查 `res.ok`，新增字段不影响它们。

## 验收

- e2e：health 返回三个字段，`protocolVersion` / `minProtocolVersion` 与 sync 响应一致。
- 镜像内 `version` 与 tag 一致（release 脚本保证 package.json 与 tag 同步）。

## Comments
