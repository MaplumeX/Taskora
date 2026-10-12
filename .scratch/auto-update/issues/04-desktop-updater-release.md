# 桌面端 updater 签名与 latest.json 发布

Status: implemented (pending first tagged release)

## 内容

- `tauri signer generate` 生成密钥。私钥和密码存入 secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，另行离线备份；公钥写入 `tauri.conf.json` 的 `plugins.updater.pubkey`。
- `bundle.createUpdaterArtifacts: true`。`desktop-release.yml` 注入签名环境变量，`tauri-action` 为每个 tag 上传 `.sig` 和合并后的 `latest.json`。
- 更新 `docs/versioning-and-deployment.md` 的「二·五」（去掉「V1 无自动更新」）以及「七」的「自更新通道」项。

## 实现

- 公钥写入 `tauri.conf.json` 的 `plugins.updater.pubkey`；Windows `installMode: passive`。
- `desktop-release.yml` 注入两个签名 secrets，`includeUpdaterJson: true`。
- 部署文档「二·五」「二·六」「七」已更新。
- 待验证：首次打 tag 后检查 Release 里的 `.sig` 与 `latest.json`（需要先在仓库 secrets 里配好私钥）。

## 验收

- 打一个测试 tag：Release 包含三平台的 updater 产物与 `latest.json`，`latest.json` 里的 `platforms` 覆盖 linux-x86_64 / darwin-* / windows-x86_64。

## Comments
