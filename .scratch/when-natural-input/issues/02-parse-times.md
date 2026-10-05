# 02 解析器：时刻

Status: implemented
Blocked by: 01

## Problem

「明天 9点」「fri 3pm」要同时给出日期和提醒时刻。

## Design

见 spec 第 1 节「时刻」。时刻可出现在日期表达前后；只有时刻时落今天（已过则明天）；裸数字一律当日期；时刻非法时整个查询无候选。

## Acceptance

- spec 时刻表逐条覆盖（含 `9:30` 按 24 小时制、`下午3点`、`9点半`、`9点一刻`、`noon`、`tonight`）。
- 「只有时刻」在时刻已过 / 未过两种情况下分别落明天 / 今天（today + 当前时刻由调用方传入，`WhenQueryOptions` 增加 `now: string /* HH:mm */`）。
- `25:00`、`下午15点` 无候选。

## Comments

### 2026-10-05 — 实现

- 时刻从查询中任意位置抽出，剩余部分按日期解析；`tonight` / `今晚` 隐含今天。
- 不完整的时刻尾巴（`tomorrow 9`、`明天 9:`、`tomorrow at`）先去掉再解析，输入过程中候选不会闪空。
- 已知局限：`tonight 9`（不带 at / pm）里的 9 会被当成 9 号。
