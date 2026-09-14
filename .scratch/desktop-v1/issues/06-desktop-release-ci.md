# 06: 桌面端发布 CI 与分发

Status: done

## 背景

发布策略（见 `docs/versioning-and-deployment.md` 二·五节）：tag `desktop-v*` 触发三平台构建；PR/main CI 只跑 desktop 的 typecheck + 单测；V1 无签名无自动更新。

依赖：02 起的全部 issue（出包内容完整才有意义）。

## 内容

1. GitHub Actions：tag `desktop-v*` 触发三平台矩阵构建——macOS `.dmg`、Windows NSIS `.exe`、Linux AppImage——产物传 GitHub Releases。
2. PR/main CI 增加 desktop 的 typecheck + 单测（不跑三平台全量构建）。
3. README 增加「桌面客户端下载」小节，含未签名说明：macOS 右键打开绕过 Gatekeeper、Windows SmartScreen 警告处理。
4. Linux 构建质量优先（主力开发平台）。

## 验收标准

- [ ] 打 `desktop-v0.1.0` tag 后三平台产物出现在 GitHub Release
- [ ] 三个安装包均可安装启动（至少 Linux 本机验证 + macOS/Windows CI 绿）
- [ ] README 绕过说明完整
- [ ] PR CI 不显著变慢（无 Rust 跨平台全量构建）

## Comments

Implemented in commit 9c28fc8. `desktop-release.yml` (desktop-v* tags): three-platform matrix (ubuntu-22.04 AppImage for glibc compat, macOS dmg, Windows NSIS) via tauri-action, uploads to GitHub Releases. PR CI gains a Linux-only `cargo check` job with rust cache — no cross-platform packaging. README (en/zh) documents downloads + Gatekeeper/SmartScreen bypass. Actual tag → artifacts needs a real push to verify.
