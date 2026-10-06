# 09: 跟随系统主题在切换与后台恢复时同步

Status: resolved

## 问题

手机版选择「跟随系统」后，系统从夜间切到日间，界面仍保留夜间主题，必须清后台重启才恢复。
共享偏好模块只依赖 `matchMedia`；Android WebView 的媒体查询取自应用主题属性，可能保留启动值。

## 实现

- background 原生插件新增 `system_theme` 查询，从 Android `Configuration.uiMode` 读取主题，并在 `onConfigurationChanged` / `onResume` 推送 `theme` 事件。
- 手机版在渲染前订阅并读取原生主题，查询期间的新事件优先于旧查询结果。
- 共享偏好模块接受不持久化的原生系统主题；所有跟随系统的解析使用此值，手动亮 / 暗设置保持不变。浏览器继续使用媒体查询。
- 同步新增命令的默认权限及生成文件；系统栏图标沿用现有主题变化监听。

## 验证

- API 全量 513 项、mobile 全量 93 项测试通过，新增 9 项主题回归测试。
- API / mobile 类型检查、修改文件 ESLint / Prettier、mobile Vite 生产构建通过。
- background 插件 Rust host `cargo check --offline` 通过。
- 环境没有完整 Android SDK，未编译 Android Kotlin / APK，也未做真机验收。真机需验证：前台切换系统主题、后台自动跨日切换后恢复、手动主题不被覆盖。

## Comments

- Android 官方说明：[WebView 深色主题](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme)。WebView 的 `prefers-color-scheme` 取自 `isLightTheme`，不能作为运行中系统 uiMode 的唯一来源。
