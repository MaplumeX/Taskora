import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * hub 的 app 版本：读 backend 的 package.json（`pnpm release` 与 tag 同步写入），
 * src/ 与 dist/ 下都在上两级。镜像构建参数 VERSION 在 main 构建时只是 `dev`，
 * 不能作为客户端的更新目标。
 */
export const HUB_VERSION = (
  JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }
).version;
