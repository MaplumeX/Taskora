# 桌面端采用 Tauri 2

Taskora 需要一个桌面客户端，与现有 web 前端功能对齐但拥有独立导航壳与原生能力（全局快捷键快速添加等）。我们选择 Tauri 2 而非 Electron：Taskora 是轻量任务管理器，Tauri 的安装体积（~10MB vs ~150MB）和内存优势明显，且三平台 CI 出包方案成熟；代价是遇到原生能力需写 Rust 代码。

## Considered Options

- **Electron**：全 JS/TS 生态、资料多，但体积与内存占用过重。
- **复用 web SPA 直接打包**：已在 `docs/versioning-and-deployment.md` 中否决——桌面端需要独立导航与原生 IPC。

## Consequences

- 原生能力（钥匙串、全局快捷键、单实例锁等）通过 Tauri 插件 + 少量 Rust 实现。
- V1 安装包不签名：macOS 需右键打开绕过 Gatekeeper，Windows 会触发 SmartScreen 警告，README 需说明绕过方法。待有真实用户后再购证书，届时为 CI 纯增量。
- V1 无自动更新，用户手动从 GitHub Releases 下载新版；updater 插件留待后续版本。
- 主力开发平台为 Linux，Linux 构建质量优先保证。
