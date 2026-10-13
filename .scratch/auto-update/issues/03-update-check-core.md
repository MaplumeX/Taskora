# 兼容判定与检查调度（共享逻辑）

Status: resolved
Blocked by: 01, 02

## 内容

- `packages/api`：纯函数 `evaluateUpdate(local, hubHealth)` → `client-too-old | hub-too-old | update-available | up-to-date`（判定表见 spec）。semver 比较需处理预发布后缀。
- 检查调度：启动延迟检查、每小时检查、切换服务器后立即检查、回前台 / 恢复网络按 5 分钟节流检查；记录上次检查时间与「跳过的版本」。平台相关的「查询目标版本有无安装包 / 执行更新」通过适配器注入，供 05 / 06 各自实现。
- 设置页：「自动检查更新」开关、「立即检查」按钮、当前版本 / 服务器版本展示（仅 Tauri 运行时显示）。

## 实现

- `packages/api/src/updates/evaluate.ts`：`compareVersions`（semver，含预发布）与 `evaluateUpdate`。
- `packages/api/src/updates/update-checker.ts`：
  - `UpdateShell { prepare(version), apply(version) }`，用 `setUpdateShell` 注册（与通知薄壳同一模式）；不注册（web）时整个功能不生效。
  - `useUpdateStore`：本机持久化 `autoCheck` / `skippedVersion` / `lastCheckedAt`（`taskora-updates`），运行态包括 `verdict` / `readyVersion` / `checking` / `failed`。
  - `checkForUpdates({ manual })`：并发调用合并为一次；手动检查会清掉「跳过此版本」；失败时保留上次的结论。
  - `initUpdateChecks()`：启动 10 秒后检查一次，运行期间每小时检查；回前台 / 恢复网络按 5 分钟节流；切换服务器与同步状态变成 `upgrade-required`（426）时立即检查。
  - `selectPendingUpdate`：返回待提示的版本，以及是否必须更新。
- 设置 → 关于（`SettingsAbout`）：服务器版本、自动检查开关、立即检查、状态说明、「更新到 vX」。只有注册了平台壳才渲染。
- `setUpdateShell` 与 `initUpdateChecks` 由 05 / 06 在各端 boot 时接入。切换服务器与前台事件的补齐见 issue 07。

## 验收

- `evaluateUpdate` 表驱动测试覆盖四种结果与边界（版本相等、预发布、hub 缺少字段的旧版本 → 视为 `up-to-date`，不报错）。
- 调度测试：节流、跳过版本、`client-too-old` 不可跳过。

## Comments
