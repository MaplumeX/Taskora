# 07: 冷启动不阻塞等待 refresh（快照路径后台静默）

Status: done

## 背景

清后台重进（进程被杀的完整冷启动）时，App 先转圈一段时间才出主界面。链路排查：WebView 冷启动约 1s 是 Tauri 架构固有成本；Engine 后端注入先于首次 pull，本地数据本可先行；真正的串行网络瓶颈是 `boot.ts` 里 `await refresh()` —— 主界面要等自建服务器响应，公网/弱网下叠加 15s 超时尤其明显。

代码注释里已写明目标语义（「有快照时，网络失败用快照继续离线运行」），但实现是**等失败发生**才继续。改为有快照时**根本不等**。

## 方案

- 有 user 快照（老用户，绝大多数冷启动）：`hydrateAuthSnapshot` 后 bootPromise 直接 resolve，主界面立即可渲染；`refresh()` 后台静默跑——成功则 `hydrateFromServer(preferences)`，401 由 client.ts 的既有路径 clear 会话并触发 Login 切换，网络失败忽略（离线运行，SyncIndicator 显示离线）。
- 无快照（从未在本机登录）：维持现状（await refresh，失败出错误重试页），无本地身份可兜底，必须等服务器裁决。
- desktop/boot.ts 同构同改（用户确认），两个壳共享同一语义。
- 安全性不降：401 仍会切 Login，只是从阻塞等待变为后台出结果再切。

## 验收标准

- [x] 有快照时 bootMobile/bootDesktop 在 refresh 完成前 resolve
- [x] 后台 refresh 401 后 App 仍切到 Login（既有 clear → store transition 路径；测试断言静默不使 boot 失败）
- [x] 无快照路径行为不变（失败 → 错误重试页）
- [x] mobile/desktop boot 测试覆盖上述行为（新增 packages/mobile/src/boot.test.ts，desktop 各 +2 用例），全量测试与 typecheck/lint 通过

## Comments
