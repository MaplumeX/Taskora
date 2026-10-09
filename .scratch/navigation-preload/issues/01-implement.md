# 实现跨端导航预加载

Type: task
Status: resolved

实现共享页面加载器、分平台空闲调度、导航意图检测，以及 Engine 项目数据预取。验证首屏优先、网络策略、读取复用、变更更新、账号隔离和网页失败恢复。

## Comments

用户已授权同时完成桌面端和网页端，无新增依赖。

## Answer

已实现，范围见 [spec](../spec.md)，测试与浏览器验证见 [validation](../validation.md)。无新增依赖，保留网页 SQLite 提前初始化与实际导航的 chunk 恢复机制。
