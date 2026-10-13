# 客户端自动检测更新

决策见 [ADR-0026](../../docs/adr/0026-client-updates-follow-hub-version.md)：客户端更新以所连 Sync Hub 的版本为目标，兼容范围按同步协议版本判定。

## 目标

- 桌面端 / Android 端自动发现「hub 已升级而本机落后」，桌面端可一键更新。
- 客户端永远不越过 hub 的版本；客户端比 hub 新且协议不兼容时，暂停同步并提示升级服务器。
- 不打扰：可选更新只给一个非模态提示；只有不兼容时才常驻提示（沿用 `SyncIndicator`）。

## 非目标

- Android 应用内安装（下载 + PackageInstaller）。
- hub 托管安装包（离线 / 内网部署）。
- 应用商店分发、操作系统代码签名。

## 版本信息来源

`GET /health`（不需要登录，ServerSetup 已用它探测服务器）返回：

```json
{ "status": "ok", "version": "0.10.0", "protocolVersion": 7, "minProtocolVersion": 7 }
```

`version` 读 backend 的 `package.json`（`pnpm release` 与 tag 同步写入），镜像 runtime 阶段一并复制它。

## 判定（纯函数，放在 `packages/api`）

输入：本机 app 版本、本机 `SYNC_PROTOCOL_VERSION` / `MIN_HUB_PROTOCOL_VERSION`、hub 的 health 结果。输出：

| 结果               | 条件                                                    |
| ------------------ | ------------------------------------------------------- |
| `client-too-old`   | 本机协议 < hub `minProtocolVersion`                     |
| `hub-too-old`      | hub `protocolVersion` < 本机 `MIN_HUB_PROTOCOL_VERSION` |
| `update-available` | 兼容，且本机版本 < hub `version`                        |
| `up-to-date`       | 其他（含本机版本 > hub，但协议兼容）                    |

`client-too-old` 也会从同步路径得到（426 → `SyncUpgradeRequiredError`），两条路径的结论必须一致。

## 检查时机

- 启动 10 秒后检查一次，运行期间每小时检查；切换服务器后立即检查。
- 回到前台（可见性变化 / 窗口获焦）、恢复网络时检查，按最近一次尝试或成功检查的时间做 5 分钟节流，避免重复事件和网络失败造成密集请求。
- 切换服务器时清除旧服务器的检查结论；旧请求 / 下载完成后不得发布过期提示，等旧准备流程结束后再检查当前服务器。
- 同一平台壳已准备好的版本在本次运行内复用；缺少安装包时下次检查重试。
- 设置页提供「自动检查更新」开关（默认开）和「立即检查」按钮。
- 「跳过此版本」只对 `update-available` 有效；`client-too-old` 无法跳过。

## 已定的默认（如需改动，请在 Comments 里写明）

- 桌面端：在后台下载，下载完成后提示「重启并更新 / 稍后」。
- Android：只提示，点击后在浏览器中打开 APK。

## Issues

1. `01-hub-reports-version.md`：hub 回报版本与协议范围
2. `02-client-min-hub-protocol.md`：客户端认可的最低 hub 协议
3. `03-update-check-core.md`：兼容判定与检查调度（共享逻辑）
4. `04-desktop-updater-release.md`：桌面端 updater 签名与 `latest.json` 发布
5. `05-desktop-updater-client.md`：桌面端检查、下载与重启安装
6. `06-android-update-prompt.md`：Android 更新提示
