# 03: 桌面端认证流与钥匙串存储

Status: done

## 背景

桌面端复用现有 JWT 登录（access + rotating refresh token），但 token 必须存 OS 钥匙串，不用 WebView localStorage。

依赖：01（`packages/api` 的 token 存储抽象）、02（Tauri 壳）。

## 内容

1. 实现 `api` 包 token 存储抽象的桌面端 backend：基于钥匙串（Linux Secret Service / macOS Keychain / Windows Credential Manager），Rust 侧通过 Tauri command 暴露给前端。
2. 登录 / 登出 / refresh token 轮换流程接通，复用 `api` 包。
3. 未配置服务器或未登录时的引导流（配置服务器地址 → 登录）。

## 验收标准

- [ ] 登录后重启应用无需重新登录（token 从钥匙串恢复）
- [ ] refresh token 轮换正常工作
- [ ] 登出清除钥匙串中的 token
- [ ] token 不出现在 localStorage / 任何明文落盘文件中

## Comments

Implemented in commits 5fa1f68 + d0e416c. Rust keyring commands (`keyring_get_token`/`keyring_set_token`, keyring crate 3.x) wired through the `@taskora/api` TokenStore; boot does a silent refresh (rotating refresh cookie) and restores the session on restart. Logout clears the keychain (NoEntry treated as success). Token never touches localStorage/plaintext (unit tests cover persist/clear/hydrate/failure paths). Live login/restart flow needs manual QA against a real server.

## Comments (review fixes)

Code review found a transient network error during boot refresh permanently cleared the keychain token. Fixed: only HTTP 401 (refresh token genuinely rejected) clears; network errors keep the token so restart stays signed in.
