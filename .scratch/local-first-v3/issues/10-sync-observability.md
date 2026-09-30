# 10 同步可观测性

Status: ready-for-agent

## Problem

同步几乎不可观测：客户端只有「离线 · N 条待同步」；LWW 的败方编辑、hub 对已删除实体 / 孤儿子任务 / 越权写 / 非法字段值的处理都是静默的。出问题时无从排查（本轮审查的若干缺陷都是靠构造测试才发现的）。

## Design

- **客户端诊断面板**（设置页）：最近一次成功同步时间、最近失败原因、Outbox 条数与最老条目的时间、游标、时钟偏移、最近 N 次 resync / bootstrap 的原因。
- **push 响应带处理报告**：被 hub 丢弃或纠正的事件（原因枚举：compacted / orphan / not-owned / rejected-value / repaired），客户端记入本地诊断日志（有界）。
- **服务端指标**：每用户 push / pull 次数、resync 次数与原因、各类纠正与丢弃计数、日志清理量；以结构化日志输出，便于接入现有监控。

## Acceptance

- 用户反馈「数据没同步」时，可以从诊断面板导出一份报告定位原因。

## Comments
