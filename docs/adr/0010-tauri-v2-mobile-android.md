# Tauri v2 mobile for Android

移动端选型 Tauri v2（Android 独占，iOS 不做）。理由：`@taskora/ui` 页面与 `@taskora/engine`（纯 TS + 窄 `SqlStorage` SQL 接口）直接复用，desktop 的 rusqlite Rust command 适配器可原样搬入 Android 工程——移动端是第三个薄壳而非新 App。拒绝的备选：React Native / Expo（UI 层全部重写、`@taskora/ui` 作废、SQLite 需换存储栈）、Flutter（engine 需 FFI 或移植，共享成本最高）、PWA（无常驻入口，且网页端 REST 优先不满足全量 Local Replica）。已知代价：Tauri 移动生态较年轻，原生能力（通知、分享目标等）需自写 Rust/Kotlin 胶水——本版范围明确不包含这些。
