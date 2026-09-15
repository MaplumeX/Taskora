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

## Comments (restart login bug — Windows)

Bug: on the packaged Windows build, closing and reopening the app always
required a fresh login. Root cause: the refresh token only ever lived in
the `rt` HttpOnly cookie, but the Tauri 2 production webview origin
(`http://tauri.localhost`) is cross-site to the self-hosted server, so
(1) WebView2 refuses the SameSite=Lax cookie entirely and (2) the backend
CSRF guard rejects `sec-fetch-site: cross-site` refresh calls with 401 —
which the boot logic treats as a real logout. The keychain-stored access
token (15 min TTL) alone can never survive a restart.

Fix — body-based refresh-token flow for desktop:

- shared: `AuthResponseDto.refreshToken?` + `RefreshRequestDto`.
- backend: `login`/`refresh`/`logout` accept `X-Client: desktop`; refresh
  token is returned/accepted in the body instead of a cookie. The
  sec-fetch-site CSRF check only applies to the cookie (web) flow.
- api: `TokenStore` gained optional `getRefreshToken`/`setRefreshToken`;
  `setClientKind('desktop')` sets the `X-Client` header; the refresh
  interceptor and `auth.api` send the keychain RT in the body and persist
  the rotated one; logout revokes it server-side.
- desktop: second keyring entry (`refresh-token`) via new Rust commands
  `keyring_get_refresh_token`/`keyring_set_refresh_token`; boot hydrates
  both tokens and declares `setClientKind('desktop')` (main + quick-add).

Tests: `packages/backend/test/auth.controller.spec.ts` (transport matrix),
`packages/api/src/api/client.test.ts` (interceptor refresh flows), updated
keyring store tests. Web flow unchanged (no header, empty refresh body).

## Comments (Windows encrypted session storage)

Superseded the Windows keyring storage implementation with a DPAPI-encrypted
session file, including legacy migration and awaited atomic persistence.
The previously documented transient-refresh fix did not cover the shared axios
interceptor; the unified refresh path now clears only on HTTP 401. Startup
is single-flight, including React StrictMode and auth-state re-renders.
See `.scratch/windows-session-storage/` and ADR-0002.
