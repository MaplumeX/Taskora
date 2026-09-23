# 01: 回前台整页刷新（mobile 复活 desktop #45 已修的问题）

Status: done

## 现象

Android 端离开前台一段时间（> 15 分钟）后重新打开，整个页面刷新：主界面
卸载后重挂载，路由、滚动位置、展开状态全部丢失。

## 根因

与 desktop #38/#45 修掉的前台刷新（foreground flash）同源但不同路径。
#45 只把 `refetchOnWindowFocus` / `refetchOnReconnect` 关掉，mobile 的
QueryClient 也已带这两个开关——真正复活它的是会话刷新路径：

- access token TTL 15 分钟（backend `auth.module.ts`）。
- desktop-engine 有 30s `setInterval` 周期同步：窗口失焦期间 token 也会
  被后台续掉，回前台几乎不会踩 401。
- mobile 是前台触发模型（无周期同步，ADR-0007），且 Android 后台冻结
  JS 定时器——后台超过 15 分钟后回前台，`visibilitychange` 触发的首个
  `/sync/pull` 必然 401。
- axios 拦截器 `refreshSession()` 置 `refreshing=true`，而 mobile
  `App.tsx` 的 `if (refreshing) return null;` 无条件卸载 `MainApp`
  （含 BrowserRouter），refresh 完成后重挂载 → 整页刷新。

web 前端的 `ProtectedRoute` 早已是正确口径：仅 `refreshing && !user`
（会话未恢复）时等待；会话已在时应放行，401 失败由 store `clear()`
自然切到 Login。

## 修复

- `packages/mobile/src/App.tsx`：`if (refreshing && !user) return null;`
- `packages/desktop/src/App.tsx`：同改（同一条潜伏路径：15 分钟节点若
  恰逢窗口不可见，回前台同样会闪一次整页卸载）。
- 回归测试：`packages/mobile/src/App.test.tsx`、
  `packages/desktop/src/App.test.tsx`（mid-session refresh 不卸载
  MainApp；会话未恢复时仍等待）。

## 验收标准

- [x] 后台超过 token TTL 后回前台，主界面保持挂载，静默 refresh 完成后无重挂载
- [x] 启动恢复期（token 在、user 未回来）仍等待，不闪主界面/登录页
- [x] refresh 401（refresh token 失效）仍正确登出切到 Login
- [x] mobile/desktop 全量测试通过（40/40 各），eslint 通过

## Comments
