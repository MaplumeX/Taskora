# 验证记录

日期：2026-10-09

- API / UI / Desktop / Frontend TypeScript 检查通过；变更代码 ESLint 和 diff 空白检查通过。
- 123 项相关测试通过：UI 67 项（包含共享加载器、空闲调度、网络策略、导航意图和项目布局），API 45 项（包含真实 SQLite 的预取去重、进入前的数据更新、过期重查、账号切换、项目页接管、已保留结果的在途读取让出资源），Web chunk 恢复 9 项，桌面导航 2 项。
- 网页与桌面 Vite 生产构建通过；桌面构建仍有原有的大 chunk 提示。本次未打包或启动原生 Tauri 窗口。
- 真实 Chromium 使用独立浏览器上下文、合成账号和快照，真实运行 Web SQLite Worker / OPFS；HTTP 由测试脚本拦截，不访问现有账号或数据库。
- 网页常用页面只在首轮同步完成后预加载；未主动加载日历等次要页面。开启省流量时不下载常用页面模块，仍可悬停项目、进入页面并显示任务。
- 故意中断项目页后台下载：当前页不刷新；真正进入时既有 chunk 恢复机制刷新一次，项目任务正常显示。三个场景均无未捕获浏览器错误。
- 这次浏览器验证检查行为与加载顺序，不是改动前后的性能基准，不能据此承诺固定启动耗时或所有首次点击都零等待。

临时验证脚本和证据：`/tmp/taskora-navigation-preload/`；包括 `browser-check.mjs`、`browser-results.json` 和两端构建日志。

## CI 回归修复

- [CI 37887386653](https://github.com/MaplumeX/Taskora/actions/runs/37887386653) 在 UI 测试中失败：MainContent 的 4 个测试没有 QueryClientProvider，未启用预加载的 NavigationWarmup 仍调用 useQueryClient。首次验证仅运行相关测试，遗漏了这组既有测试；本地全量测试复现了相同失败。
- 将启用后的预加载逻辑拆入子组件；未配置 NavigationPreloadProvider 时直接返回空内容，无需 QueryClient。新增不提供任何 Provider 时不报错、不加载模块的回归测试。
- 修复后 UI 全量 81 个文件、938 项测试通过；UI TypeScript、变更文件 ESLint 和 diff 空白检查通过。本轮桌面全量 59 项测试及移动端 TypeScript 检查也通过。
- 修复后的全量 UI 日志：`/tmp/taskora-preload-ui-fixed.log`。远端 CI 尚未运行此修复。
