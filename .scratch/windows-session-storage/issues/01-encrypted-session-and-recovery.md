# 01: 加密会话存储及启动恢复

Status: done

## 实现

- Rust `session` 模块负责版本化、服务器绑定、迁移及原子保存。
- Windows `session.dpapi` 使用当前用户范围的 DPAPI；macOS / Linux 使用一个系统钥匙串会话条目。
- 桌面 `secure-token-store` 等待写入完成，刷新在跨窗口锁内重新读取最新凭证。
- API 统一刷新入口，合并并发刷新，只有 HTTP 401 清空会话。
- 启动恢复使用共享 Promise，失败显示重试入口。

## 验证

- API：99 项测试通过；桌面端：23 项通过；共享 UI：105 项通过。
- API / desktop / UI / frontend TypeScript 类型检查通过；变更涉及的 ESLint 检查通过。
- 桌面端 Vite 与 Web 前端生产构建通过。
- `cargo test --offline --lib`：4 项原生迁移/服务器隔离测试通过。
- 使用临时检查 crate 直接引用仓库 `session/mod.rs`，对 `x86_64-pc-windows-msvc` 执行 `cargo check --offline --tests` 通过，包含真实 DPAPI 调用及 Windows 测试代码的类型检查。
- 完整 Windows 交叉构建受当前 Linux 环境缺少 `llvm-rc` 限制；未生成 Windows 安装包，也未声称完成 Windows 真机测试。
- Windows CI 与桌面发布工作流已加入 `cargo test --locked --lib session::`，用于真实 Windows 用户环境下运行 DPAPI 文件读写、轮换、登出和损坏文件测试；此处未触发远端 CI。

## 手工复测

新版 Windows 安装包仍需确认：旧版登录后升级迁移；登录后关闭重开；断网启动再联网重试；快速添加与主窗口轮换；退出登录后重开；凭据文件无法解密时显式清除并重新登录。
