# 客户端更新以 Sync Hub 为准，兼容范围按同步协议判定

Taskora 以自托管的 Docker 服务端（Sync Hub）为中心，桌面端与 Android 端只是它的客户端。此前两端都没有自动更新（ADR-0001、`docs/versioning-and-deployment.md`），用户只能手动去 GitHub Releases 下载。现在加入自动检测更新时，如果以 GitHub 上的最新版本为准，客户端会越过用户自己的服务端，出现「客户端比 hub 新」。服务端升级往往滞后，这类情况会很常见。

## Decision

- **更新目标是当前连接的 hub 的版本，不是 GitHub latest。** hub 在不需要登录的 `GET /health` 上回报 `version`（app semver）、`protocolVersion`、`minProtocolVersion`。客户端最多升级到 `v{hub version}`，桌面端的 updater endpoint 在运行时拼成该 tag 的 `latest.json`，Android 端直接指向该 tag 的 APK。
- **兼容范围以同步协议版本表达，不维护 semver 范围。** 真正会导致不兼容的是同步协议。按协议号判断，每次发版不需要手工维护 `minClientVersion`。
  - hub 侧（已有）：接受 `[MIN_SYNC_PROTOCOL_VERSION, SYNC_PROTOCOL_VERSION]`，低于下限回 426。
  - 客户端侧（新增）：`MIN_HUB_PROTOCOL_VERSION`，即客户端认可的最低 hub 协议。hub 低于它时客户端暂停同步、保留 Outbox，提示「请升级服务器」。只有在按能力降级不安全时才提高它（新客户端写入的字段旧 hub 不认识，会永久卡在 Outbox，其他设备看不到）。初始值为 7，与 hub 下限一致：ADR 0024 之后，协议 7 的客户端写的 `start` 在协议 6 的 hub 上会被拒。
- **兼容性决定更新的紧急程度：**

  | 情况                                         | 同步        | 更新提示                     |
  | -------------------------------------------- | ----------- | ---------------------------- |
  | 客户端协议 < hub 下限                        | 暂停（426） | 必须更新到 `v{hub version}`  |
  | 兼容，客户端版本 < hub 版本                  | 正常        | 可选更新                     |
  | 兼容，客户端版本 ≥ hub 版本                  | 正常        | 无                           |
  | hub 协议 < 客户端 `MIN_HUB_PROTOCOL_VERSION` | 暂停        | 提示升级服务器；客户端不降级 |

- **桌面端**：使用 `tauri-plugin-updater`，签名密钥与操作系统代码签名无关，安装包不签名时也可以用。后台下载，提示重启后安装；重启前等待 Engine 的写入落盘。目标 tag 缺少当前平台的安装包时，视为暂无更新。
- **Android 端**：只做检测和提示，点击后用浏览器打开 `v{hub version}` 的 APK。APK 是否存在经 GitHub API 查询（webview 直接 HEAD 下载地址会被 CORS 拦下）。应用内安装（`REQUEST_INSTALL_PACKAGES` 加原生插件）留到以后。
- **Web**：始终随 hub 镜像一起更新，不参与。

## Considered Options

- **追 GitHub `releases/latest`**：实现最简单，但会让客户端越过 hub，违反「客户端 ≤ 服务端」。
- **hub 回报 semver 的 `minClientVersion` / `maxClientVersion`**：表达能力与协议号相同，但每次发版都要手工判断范围，而且与已有的协议版本机制重复。
- **hub 自己托管安装包和 manifest**：内网 / 无法访问 GitHub 的部署也能更新，但镜像体积会明显变大。等有这类用户时再加，它与本决策兼容，只是改变 endpoint。

## Consequences

- 取代 ADR-0001 与 `docs/versioning-and-deployment.md` 中「V1 无自动更新」的结论。
- updater 签名私钥一旦丢失，已安装的桌面端再也收不到更新，必须离线备份。
- 无法访问 GitHub 的客户端只能看到提示，无法下载。
