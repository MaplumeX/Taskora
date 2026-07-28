# Design — Refresh Token 机制

## Token 模型

### Access Token

- JWT（沿用 `JwtModule`），有效期 `15m`，签发载荷 `{ sub: userId }`。
- 服务端不存，无状态校验。

### Refresh Token

- 服务端生成 32 字节随机串 `crypto.randomBytes(32).toString('base64url')`。
- 入库只存 `sha256(token)`（`tokenHash`）。
- `familyId`：登录时新生成一个 family；refresh 轮换时延续同 familyId。reuse detection 以 familyId 为单位吊销。
- 有效期 `30d`。

## 数据模型

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  familyId  String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([familyId])
}
```

需在 `User` 模型上加反向关系 `refreshTokens RefreshToken[]`。

## 模块结构

在 `auth` 模块内扩展，不新建模块。

```
src/auth/
  auth.service.ts        // 新增 issueRefreshToken / rotateRefreshToken / revokeRefreshToken
  auth.controller.ts     // 新增 /refresh /logout
  refresh-token.helpers.ts  // crypto helpers（hash, generate）
```

`AuthModule` 已有 `JwtModule`；`AuthService` 注入 `PrismaService`（已有）。

## Cookie

- 名称：`rt`
- 属性：`HttpOnly; Secure（prod）; SameSite=Lax; Path=/auth; MaxAge=30d`
- 写 cookie：在 controller 用 `res.cookie(...)`（Nest Express adapter）。
- 清 cookie：`res.clearCookie('rt', { path: '/auth' })`。
- 开发环境（http）不设 Secure；按 `process.env.NODE_ENV`。

> controller 需注入 `Response` 以操作 cookie；不要返回 `res.send()` 才能让 Nest 的序列化拦截器输出 body —— 用 `res.cookie(..., { ... })` 后 `return dto`，Nest 会在已写 cookie 的 response 上序列化 body。

## CSRF 防护

- `SameSite=Lax` cookie：跨站 GET 携带、跨站 POST 不携带。
- `/auth/refresh` 与 `/auth/logout` 都是 `POST`，body 为空，Lax 下跨站表单 POST 也带不上 cookie，足够。
- 额外校验：controller 中检查 `req.headers['sec-fetch-site']` 不为 `cross-site`（缺失时放行，兼容非浏览器客户端测试），或要求 `Origin` 在白名单。**选 `Sec-Fetch-Site` + 允许 missing**：双保险且对 curl 友好。

## 流程

### 登录

```
POST /auth/login
  → 校验密码
  → access = jwt.sign({sub}, {expiresIn: '15m'})
  → familyId = randomUUID(); rt = generateRt(); rtHash = hash(rt)
  → INSERT RefreshToken { userId, tokenHash: rtHash, familyId, expiresAt: now+30d }
  → res.cookie('rt', rt, {...})
  → return { accessToken: access, user: {...} }
```

### 刷新

```
POST /auth/refresh
  → rt = req.cookies['rt']；无 → 401
  → rtHash = hash(rt)
  → row = prisma.refreshToken.findUnique({ where: { tokenHash: rtHash } })
  → 无 → 401 + clearCookie
  → row.expiresAt < now → revoke + 401 + clearCookie
  → row.revokedAt != null  → reuse detected: UPDATE refreshToken SET revokedAt=now WHERE familyId=row.familyId；返回 401 + clearCookie
  → 正常：
      - UPDATE row SET revokedAt=now
      - newRt = generateRt(); INSERT new row 同 familyId, expiresAt=now+30d
      - res.cookie('rt', newRt)
      - access = jwt.sign({sub: row.userId})
      - return { accessToken, user: me }
```

> 事务：使用 `prisma.$transaction`（匹配 + revoke + insert 新 row）。reuse detection 的关键：只有当哈希匹配且 `revokedAt` 不为空时才触发全量吊销；并发用唯一约束 + 事务保证一次 RT 只能成功消费一次。

### 登出

```
POST /auth/logout   (JwtAuthGuard)
  → rt = req.cookies['rt']；若存在 → 标记 revoked
  → res.clearCookie('rt')
  → return { ok: true }
```

## 前端

### Store

```ts
// auth.store.ts
partialize: (s) => ({ user: s.user })  // 不再 persist token
```

新增 `refreshing` 标志位（不在 persist 范围）。

### 启动恢复

- `main.tsx` 或 `App` 顶层：若 `auth.store` 有 `user` 快照但 `token` 为空 → 调 `refresh()`。
  - 成功 → setAuth(access, user)
  - 失败 → clear()；如果是 `ProtectedRoute`，自然被重定向到 `/login`。
- `ProtectedRoute` 改为：只检查 `token || refreshing`；若正在刷新则显示 skeleton / null；刷新结束后再判 token。

### client.ts 拦截器

```ts
let isRefreshing = false;
let waitingQueue: Array<() => void> = [];

apiClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry || original.url.includes('/auth/refresh')) {
      // refresh 自身 401：直接失败
      if (original.url.includes('/auth/refresh')) {
        useAuthStore.getState().clear();
      }
      return Promise.reject(error);
    }
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const { accessToken } = await refresh();  // 带 cookie
        useAuthStore.getState().setToken(accessToken);  // 仅更新 token
        waitingQueue.forEach((cb) => cb());
        return apiClient(original);
      } catch {
        useAuthStore.getState().clear();
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
        waitingQueue = [];
      }
    } else {
      return new Promise((resolve) => {
        waitingQueue.push(() => {
          original._retry = true;
          resolve(apiClient(original));
        });
      });
    }
  },
);
```

store 需新增 `setToken(t)`。

### useLogin / useRegister / useLogout

- `useLogin.onSuccess`：`setAuth(data.accessToken, data.user)` —— 不变（RT 自动由 cookie 处理）。
- `useRegister.onSuccess`：维持现状（跳 `/login`）。
- `useLogout`：改为 async，先 `POST /auth/logout`，再 `clear() + queryClient.clear() + navigate('/login')`。

## 风险/权衡

- RT 轮换会增加 DB 写入与 cookie 写入频率；30d 有效期下频率低，可接受。
- `Sec-Fetch-Site` 校验对非浏览器（curl）宽松（missing 放行）—— 开发友好；生产可加 `Origin` 白名单做更强约束（留待安全加固任务）。
- 启动恢复期 SSR/首屏闪烁：本应用是纯 SPA（Vite），无 SSR，首屏已有 skeleton；可接受。
- reuse detection 在并发下依赖 DB 唯一约束与事务；设计上每次 RT 只使用一次，正常路径无并发竞争。

## 回滚

- 迁移可降级（表是新增的，drop 安全）。
- 前端可回退到 localStorage token 方案（旧代码在 git 历史）。
