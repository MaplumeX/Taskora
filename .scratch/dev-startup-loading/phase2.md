# 首屏优化第二轮：按需加载、SQLite 提前准备、身份请求复用

日期：2026-10-09

## 完成范围

按本轮授权完成三项优化，未修改 Task 业务规则、SQLite 数据模型、Outbox 或同步协议。

1. 设置弹窗、助手面板在首次打开时动态加载，加载后保持挂载，保留原有关闭时的状态与行为。助手的布局 / docking hooks 拆到轻量模块，快捷键和全屏助手不再通过 hooks 静态引入聊天面板。Web AppShell 也通过现有 `lazyWithRetry` 加载，使入口先恢复身份、准备引擎。
2. 恢复 token 后提前创建 SQLite Worker，Worker 启动即初始化 SQLite/WASM。此时不打开账号数据库；仍在取得账号身份和 leader 锁后调用 `openStorage(userId)`。预加载 Worker 由 leader 复用，未使用资源在登出 / 会话清理时释放。打开失败沿原路径回退 REST。
3. 会话恢复使用应用同一个 QueryClient 的 `['auth', 'me']` 查询，界面复用在途请求和结果。`staleTime: 0` 保证本次恢复仍校验当前身份，缓存不能代替身份验证；不增加启动请求的重试次数。token 刷新期间界面提前挂载的并发请求也复用同一 Promise。

没有新增依赖。生产构建入口主包由上一轮约 1,117.73 KB（gzip 337.30 KB）拆到 472.49 KB（gzip 147.56 KB）；这是入口包缩小，不代表整站所有 chunk 的总大小按相同比例减少。

## 测量方法

- 修改前在本轮重新建立基线，不拿前一轮的 21.5 秒或 3.1 秒作为本轮收益对照。
- 当前工作区的 Nest / Vite 开发服务，独立端口 3012 / 5182；独立 PostgreSQL 15439，沿用隔离账号的 1000 条合成 Task，其中 12 条 Today Task。
- 真实 Chromium。全新副本使用全新的浏览器配置目录；已有副本场景保留同一配置目录，停止并重启前后端后再打开浏览器。
- 服务就绪后，从页面导航开始计时，不包括 pnpm 进程启动及后端编译等待。
- 全新副本场景的 Vite 使用 `--force`，已有副本重启场景不强制重新预构建；两侧条件一致，源模块转换缓存都因进程重启而清空。
- 正式代码测量没有临时性能插件。临时 Vite 配置仅隔离缓存目录、端口与实际依赖目录访问权限。
- 等到指定任务 `启动测试任务 0000` 可见，同时记录任意首条任务可见时间、已提交 sync cursor、Today 行数、全部请求和浏览器错误。刷新在同一浏览器中进行。
- 本轮宿主环境比前一轮慢，HTTP 和 CPU 耗时也存在波动。以下是单轮样本，不代表所有机器的固定延迟或严格统计收益。

## 最终结果

| 场景                 | DOMContentLoaded：修改前 → 修改后 | 任意首条 Task：修改前 → 修改后 | 指定 Task 0000：修改前 → 修改后 |
| -------------------- | --------------------------------- | ------------------------------ | ------------------------------- |
| 冷服务、全新副本     | 4.554 → 2.853 秒                  | 6.316 → 5.733 秒               | 7.109 → 5.868 秒                |
| 保留副本、重启前后端 | 4.446 → 3.013 秒                  | 6.179 → 5.469 秒               | 6.186 → 5.476 秒                |
| 全新副本完成后再刷新 | 0.648 → 0.465 秒                  | 1.724 → 1.365 秒               | 1.729 → 1.371 秒                |
| 保留副本重启后再刷新 | 0.691 → 0.439 秒                  | 1.825 → 1.364 秒               | 1.831 → 1.371 秒                |

各轮 Today 均显示 12 条 Task，浏览器错误数为 0。全新副本都执行 bootstrap；已有副本重启和刷新都没有重新 bootstrap。

全新副本完整请求数由 419 降到 403，刷新由 416 降到 400。修改前首屏加载 SettingsModal / AssistantPanel，修改后未请求它们，直到点击对应入口才下载。

每次导航正常身份恢复的 `/auth/me` 由 2 次降到 1 次。最终全新副本：Worker 请求第 2.844 秒开始，身份请求第 2.853 秒开始、第 2.904 秒完成；SQLite JS 请求第 2.881 秒开始，已经与身份请求重叠。WASM 随 Worker 初始化自动加载，不再等待发送数据库 open 请求后才开始初始化。

**没有达到接近即时显示。** 冷服务仍约 5～6 秒。全新副本中，入口加载到 DOMContentLoaded 约 2.85 秒，SQLite JS / WASM 后续请求到约 4.11 秒结束，bootstrap 从约 4.66 秒开始，cursor 在约 5.89 秒前完成提交。三个 bootstrap HTTP 请求耗时合计约 183 毫秒，其余区间还包含本地应用数据、初始化和界面渲染。上述时间区间不是独立 CPU 耗时，不能直接认定某条 SQL 或某个函数耗时相同。

## 验证

- Frontend / UI TypeScript 检查通过；修改文件 ESLint、格式检查通过。
- 18 项前端相关测试通过：身份恢复 8 项，Worker 准备 / 清理 4 项，Web Engine 装配 4 项，Worker storage 2 项。
- 88 项 UI 测试通过：助手面板 17 项、键盘快捷键 71 项。
- 生产 Web 构建通过，SQLite Worker / WASM 正常输出。构建仍有大于 500 KB 的 chunk 提示。
- 真实浏览器验证：首屏不下载隐藏设置 / 助手；设置打开、关闭、再次打开；助手开关与快捷键；全屏切换及 docking；第二标签页读副本；关闭 leader 后另一标签页接替，cursor 保留。所有检查通过。
- 未操作用户现有账号、数据库或服务；完成后停止隔离实例，并清理临时依赖目录。

## 文件与证据

实现文件：

- `packages/ui/src/components/layout/LazyShellFeatures.tsx`
- `packages/ui/src/components/agent/assistant-panel-layout.ts`
- `packages/ui/src/components/layout/AppShell.tsx` / `agent/AssistantPanel.tsx`
- `packages/ui/src/components/keyboard/KeyboardShortcuts.tsx` / `pages/Agent.tsx`
- `packages/frontend/src/router.tsx` / `main.tsx`
- `packages/frontend/src/engine/browser-storage.ts` / `web-engine.ts` / `sqlite.worker.ts`
- `packages/frontend/src/lib/sessionRecovery.ts`

原始测量位于 `/tmp/taskora-startup-festive-insect/`：

- `phase2-before-fresh-results.json` / `phase2-before-retained-results.json`
- `phase2-complete-fresh-results.json` / `phase2-complete-retained-results.json`
- `phase2-measurement-summary.json`
- `phase2-feature-checks.json` / `phase2-feature-checks.log`
- `phase2-final-build.log`
- 对应页面 PNG、`profile.mjs`、`verify-features.mjs`

中途的 `phase2-after-*` 和 `phase2-final-*` 是补齐 AppShell 懒加载及并发身份请求处理之前的测试，不用于上表最终结果。
