# 01: 修复开启状态栏后通知不显示

Status: resolved

## 问题

Android 上打开「状态栏快速添加」后，开关显示已开启，但通知栏没有入口。

## 原因

- 锁定的 `@tauri-apps/plugin-notification@2.4.0` 中，`channels()` 调用 `plugin:notification|listChannels`，而插件默认 ACL 仅允许 `list_channels`。Tauri 在转换原生命令为 camelCase **之前**检查 ACL，因此请求被拒。
- 状态栏壳吞掉渠道初始化错误并永久缓存为成功，继续向不存在的渠道发布；后续刷新也不重试渠道初始化。
- `sendNotification()` 返回 `void`，内部通过 `window.Notification` 发起异步调用；即使加 `await` 也不能捕获原生发布失败。控制器在发布完成前就报告开启成功。
- 移动端 Reminder 壳使用同一查询/发送 API，同样受这两个桥接问题影响。

## 修复范围

- 移动端共享窄桥接：使用 ACL 对应的 `list_channels` 和可等待的 `notify` 命令，不扩大权限、不修改依赖。
- 状态栏渠道/动作初始化失败不缓存，失败向上抛出；检测被用户关闭的状态栏渠道。
- 开启时等待发布，失败回滚开关并提示检查系统通知设置；后台失败记录诊断并允许下次刷新重试。
- 回归覆盖实际 JS 插件与 IPC 边界，而非只 mock 壳接口。

## 验证

- Mobile 全量测试：58/58 通过（含保留真实 notification JS API、在 IPC 边界模拟 ACL 的 8 项桥接回归）。
- API 全量测试重跑：224/224 通过（状态栏控制器 14 项）。
- SettingsGeneral 组件测试：5/5 通过，覆盖发布期间等待、失败保持关闭与重试。
- Mobile / API / UI 类型检查、改动文件 ESLint、Mobile Vite 生产构建、`git diff --check` 均通过。
- 尚未生成/安装 APK，也无 Android 真机验收。仍需验证授权、开启后的状态栏图标/下拉入口、渠道关闭后的提示、重新授权/开启恢复与快速添加。

## Comments

API 首轮全量测试 223/224，通过重跑恢复为 224/224。唯一失败为未修改的 `src/engine/domain-backends.engine.test.ts:123`：测试假设连续两次删除的毫秒时间戳不同，但未推进时钟；单文件重跑 11/11 通过。此次未修改 Engine 的删除/恢复行为，保留该时间相关波动为独立后续问题。
