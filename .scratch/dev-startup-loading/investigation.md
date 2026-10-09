# 本地开发首次任务加载缓慢：排查与修复

日期：2026-10-09

## 结论与限制

发现并修复了两个确定的下载开销：开发服务器未压缩源码 / WASM / 同步快照，以及 Vite 给第三方 SQLite 生成脚本注入大体积内联 sourcemap。正式代码的冷服务、全新浏览器副本实测约 3.12 秒显示指定 Today Task，刷新约 0.65 秒；保留副本重启服务约 3.08 秒，未重复 bootstrap。

**不能把之前的 21.5 秒与现在的 3.12 秒之差全部归为代码修复收益。** 早期独立 HTTP 服务发送 3.65 MB 也耗时约 12 秒，说明环境传输本身存在明显等待。后续同一已预热服务、两个全新浏览器的对照中，禁止压缩和允许压缩分别约 1.47 秒、1.52 秒；此时传输不再是瓶颈。前后测试的吞吐条件发生了变化。响应体积缩小可以稳定验证，延迟收益依赖实际环境。

## 为什么比早期多了等待

Git 提交 `acb56e10aeaef4b546b6cf14287902c202a5d666`（2026-09-30，Local-first v3，#117）加入 Web SQLite / OPFS 本地副本装配。此前 Web 通过 REST 获取当前视图；现在先下载 SQLite JS 和 WASM、打开 Local Replica，再从本地查询 Task。全新副本还需要从 Sync Hub bootstrap。

已安装 Vite 5.4.11 对没有 map 的 JavaScript 注入包含源码的 fallback inline sourcemap。SQLite 原始生成模块约 643 KB，开发响应变为约 3.65 MB。Vite 插件转换 CPU 合计约 0.1 秒，不能把早期请求的 16.6 秒全归为编译 CPU。

入口静态源码依赖图约 292 个本地模块；一次完整浏览器访问约 419 个请求。仅启动 Web / 后端也能复现早期等待，没有证据将桌面端 / Android 的并行启动认定为主因，也没有据此认定 PostgreSQL 存在慢 SQL。

## 正式变更

- `packages/frontend/vite/dev-loading.ts`：仅在 Vite serve 时启用响应压缩，明确包含 `application/wasm`；只给第三方 SQLite `.mjs` 返回空 mappings，阻止 fallback map 注入。应用源码保留调试映射。
- `packages/frontend/vite.config.ts`：注册上述插件，保留 SQLite 的依赖预构建排除规则与 WASM 定位方式。
- `packages/backend/src/common/http-compression.ts` / `main.ts`：压缩 HTTP 响应，包括 bootstrap 大快照；明确排除 `text/event-stream`，避免实时事件被缓冲。
- 两个 package.json 及锁文件增加 compression / 类型依赖。最终验证使用锁文件解析的 compression 1.8.2、@types/compression 1.8.1。
- `packages/backend/test/http-compression.spec.ts`：覆盖大 JSON 内容保持、SSE 不压缩、identity 客户端。

生产 Web 构建不启用开发插件；后端压缩按客户端 Accept-Encoding 协商。不修改 Task / Replica / 同步业务语义。

## 测试条件与测量口径

- 本工作区缺少环境文件，使用隔离 Nest / Vite 开发服务，端口分别为 3012 / 5182；未访问现有账号或数据库。
- 独立 PostgreSQL 16 实例（端口 15439），合成账号有 1000 条 Task，其中 12 条显示在 Today。
- 真实 Chromium 浏览器访问 `/today`；验证 12 条 Today Task 显示、同步 cursor 已提交、浏览器无错误，并查看页面截图。
- 时间从浏览器发起页面导航开始，到指定文本 `启动测试任务 0000` 可见；不包含执行 pnpm 后到服务器就绪的进程启动时间。
- “全新副本”使用新浏览器配置目录；“保留副本重启”保留浏览器配置目录和数据库，停止并重启前后端进程，再打开浏览器。后者确认只有增量 pull，没有 bootstrap。
- 冷服务测量重新启动 Vite，使源模块转换缓存为空；最终全新副本轮还强制重新预构建依赖。正式测试临时配置仅调整隔离端口、cacheDir 和依赖目录访问权限，没有额外性能插件或后端预加载注入。
- 先前复用本机依赖导致 WASM 403 的无效测试已排除。

## 延迟结果

早期测量的“首条 Task”实际等待指定 Task 0000；这里修正名称，避免与“任意一条 Task”混淆。

| 场景                                     | DOMContentLoaded | 指定 Today Task 可见 | 刷新后同一 Task 可见 |
| ---------------------------------------- | ---------------: | -------------------: | -------------------: |
| 早期原配置、全新副本                     |         9.779 秒 |            37.873 秒 |             0.675 秒 |
| 早期仅关闭 SQLite fallback map、全新副本 |         8.950 秒 |            21.462 秒 |             0.613 秒 |
| 正式代码、冷服务、全新副本               |         2.074 秒 |             3.121 秒 |             0.645 秒 |
| 正式代码、保留副本、重启服务             |         2.120 秒 |             3.084 秒 |             0.648 秒 |

上述跨轮结果同时受环境变化影响，不能用作严格的优化收益对照。

正式全新副本轮：任意首条 Task 3.030 秒可见，bootstrap 提交 cursor 在 3.126 秒前完成；SQLite JS 请求约 133 毫秒、WASM 约 39 毫秒。两个 500 条 Task 数据页的 HTTP 请求分别约 38、39 毫秒，另有空的终止页。12 条 Today Task 正常显示，浏览器错误数为 0。

服务已预热后补充两个全新浏览器上下文，确认没有使用已有副本来冒充首次同步：

| 请求编码      | 指定 Task 可见 | 两个数据页请求合计 | bootstrap          |
| ------------- | -------------: | -----------------: | ------------------ |
| 强制 identity |       1.467 秒 |            54 毫秒 | 有，重新初始化副本 |
| 正常协商压缩  |       1.518 秒 |            53 毫秒 | 有，重新初始化副本 |

这一对照没有显示低延迟本机环境下压缩带来时间收益。它支持的是：当前预热服务的首次数据初始化约 1.5 秒；先前 21.5 秒中的相当部分不能只用代码解释。

## 响应体积与兼容性

正式代码直连原始 HTTP 响应测量：

| 响应                |   解压后大小 | Brotli 传输大小 | sourcemap |
| ------------------- | -----------: | --------------: | --------- |
| SQLite `index.mjs`  | 643,187 字节 |    175,156 字节 | 无        |
| SQLite WASM         | 868,907 字节 |    405,811 字节 | 不适用    |
| 应用 `src/main.tsx` |  11,182 字节 |      5,147 字节 | 保留      |

原 SQLite 开发响应为 3,651,562 字节。代码调整降低其实际传输体积约 95%，这项字节数改善不依赖跨轮延迟比较。

真实 `/api/v1/events?since=0` 请求声明支持 gzip / br，仍未返回 Content-Encoding；hello / resync 首帧约 4 毫秒收到。

验证通过：前后端 TypeScript 检查、修改文件 ESLint、新文件 / package.json Prettier 检查、3 项 HTTP 压缩测试、生产 Web 构建。生产构建仍提示大于 500 KB 的 chunk，尚有后续代码拆分空间。

## 原始证据

目录：`/tmp/taskora-startup-festive-insect/`

- `valid-baseline-results.json` / `no-sqlite-sourcemap-results.json`：早期逐请求基线与 map 对照。
- `formal-final-fresh-results.json`：正式代码、最终依赖版本、冷服务全新副本。
- `formal-retained-restart-results.json`：保留副本后重启前后端。
- `formal-control-identity-results.json` / `formal-control-compressed-results.json`：同一预热服务下两个全新浏览器的编码对照。
- `final-response-sizes.json`：原始 HTTP 传输字节数及映射检查。
- 相应 PNG：真实浏览器 Today 页面截图。
- `profile.mjs`：浏览器测量脚本；`formal.config.mts`：隔离运行配置。

测试进程和依赖目录由排查临时建立；完成后停止隔离实例并移除临时依赖链接，已有服务保持运行。
