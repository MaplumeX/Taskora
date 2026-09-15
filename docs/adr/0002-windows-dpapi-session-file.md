# Windows 登录会话使用 DPAPI 加密的本地文件

Windows 桌面端改用当前用户范围的 DPAPI 加密本地会话文件，替代直接保存令牌的 Windows Credential Manager 条目。这使应用可以把访问令牌与轮换刷新令牌作为一个整体写入，并确认写入结果；加密密钥仍由 Windows 管理，不在应用目录存放明文密钥。macOS / Linux 继续使用系统钥匙串，改为一个完整会话条目。

会话包含版本、服务器地址及两个令牌。Windows 文件位于 Tauri 的 `app_local_data_dir()/session.dpapi`（通常为 `%LOCALAPPDATA%\app.taskora.desktop\session.dpapi`）；先加密，再写入同目录临时文件、同步、替换正式文件。文件只适合当前 Windows 用户使用，不作为可跨机器复制的登录备份。[DPAPI 文档](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)

第一次读取新存储时迁移旧 `auth-token` / `refresh-token` 条目，只有新会话成功写入后才尝试删除旧条目。退出登录写入空会话，防止删除旧条目失败后再次迁入旧令牌。读取或解密失败保留原文件并显示重试入口，用户也可以显式清除本机登录信息后重新登录；临时网络故障不删除凭证，服务器明确以 HTTP 401 拒绝刷新时才清除会话。

启动恢复在 React 生命周期之外合并为一次执行。主窗口和快速添加窗口使用同源 Web Locks 串行执行登录、刷新和退出，并在锁内读取最新会话，防止重复使用已轮换的刷新令牌。登录与刷新必须等待原生持久化完成后才发布新认证状态。
