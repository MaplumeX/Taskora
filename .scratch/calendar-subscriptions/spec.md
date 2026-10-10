# 日历订阅：在 Today / Upcoming / Calendar 中显示外部日程

Status: implemented — awaiting device acceptance

订阅外部日历（Google / Outlook / iCloud 等提供的私密 iCal 地址），把其中的日程只读地显示在 Today、Upcoming 与 Calendar 视图里，和任务并排，便于安排一天（对齐 Things 3 的 Calendar Events）。相关：ADR 0023。

## Problem Statement

任务按日期排好了，但会议、约会等固定日程在另一个日历应用里。安排今天要做什么时，看不到「下午 2 点到 4 点有会」，只能来回切换应用，排出来的计划经常和日程冲突。

## Solution

- **订阅**：设置 → 日历里粘贴一个 ICS 订阅链接（`https://` / `http://` / `webcal://`），名称缺省取日历自带的名称（`X-WR-CALNAME`），颜色从调色板自动分配，可改；可单独停用或删除。
- **Today**：标题下方、任务之前列出今天的日程：全天在前，其余按开始时间；行首色条为订阅颜色，显示时间段与标题（有地点时附小字）。已结束的日程弱化。
- **Upcoming**：本周按天分组的每一天，在任务之前列出当天日程；之后的月份分组同样在任务之前列出区间内的日程，行上带日期 chip（跨天日程只在首日出现一次）。Today 与 Upcoming 共用一次查询（今天到第 3 个月分组的月末）。
- **Calendar**：月网格每格先放日程色块（订阅颜色的竖条 + 标题，不同于任务的浅底色块），再放任务；点格子打开的当天面板顶部同样列出日程。
- 日程只读：不能勾选、拖动、编辑，不进 Selection、不受 Tag 过滤影响（过滤时隐藏，同 Repeat Preview）。

## User Stories

1. As a Taskora 用户, I want 粘贴一个 iCal 订阅链接即可接入我的日历, so that 不需要授权第三方账号
2. As a Taskora 用户, I want 在 Today 顶部看到今天的会议与约会, so that 安排任务时避开它们
3. As a Taskora 用户, I want Upcoming 每一天也列出当天日程, so that 提前规划这一周
4. As a Taskora 用户, I want Calendar 月视图里看到日程, so that 一眼看清哪天忙
5. As a Taskora 用户, I want 每个订阅有自己的颜色, so that 分辨工作日历和个人日历
6. As a Taskora 用户, I want 暂时停用某个订阅而不删除, so that 需要时一键恢复
7. As a Taskora 用户, I want 订阅拉取失败时在设置里看到原因, so that 知道链接失效需要更换
8. As a Taskora 用户, I want 重复日程、全天日程、跨天日程都按我的账号时区正确显示, so that 日程落在正确的日子和时间

## Implementation Decisions

- **存储在 hub，不进 Local Replica**（ADR 0023）：`CalendarSubscription` 表（名称、URL、颜色、启用、上次成功拉取时间、上次错误），经 REST 管理（`/calendar/subscriptions`）。不是同步实体：不走 Change Event，没有离线编辑。
- **由 hub 拉取与解析**：浏览器不能跨域读取 Google 等日历的 ICS（无 CORS 头），三端统一由 hub 拉取。按订阅在内存缓存解析结果 15 分钟；`GET /calendar/events?from&to`（日期键，含首尾，最多 100 天，覆盖 Upcoming 全区间）返回所有启用订阅在区间内的出现。
- **解析**：`ical.js` 解析；重复规则（RRULE / RDATE / EXDATE）与单次改动（RECURRENCE-ID）展开到请求区间。时区：文件内 VTIMEZONE 优先；只有 IANA TZID 时按该时区解释墙钟；浮动时间按账号时区。取消的日程（`STATUS:CANCELLED`）不显示。
- **线上形态**：全天日程给日期键（`startDate`，`endDate` 不含）；定时日程给 UTC 时刻（`start` / `end`）。客户端按账号时区把定时日程归到它覆盖的每一天（跨天日程每天都出现，时间文案按当天截断显示「开始 – 」/「– 结束」）。
- **安全**：只接受 http(s)（`webcal://` 视同 `https://`）；连接时校验解析出的 IP，拒绝回环 / 私网 / 链路本地等地址（防 SSRF，含 DNS rebinding），自托管需要订阅内网日历时可设 `CALENDAR_ALLOW_PRIVATE_NETWORK=true`；超时 15 秒、最多 5 次重定向（每跳重新校验）、正文上限 10 MB。添加订阅时先拉取一次，失败即拒绝并返回原因。
- **订阅颜色**：固定调色板（8 色）的键，新订阅取用得最少的颜色。
- **客户端**：`useCalendarEvents(from, to)`（React Query，5 分钟 stale，聚焦时重取，订阅变更后失效）；离线或请求失败时不显示日程，不报错。

## Testing Decisions

- backend：ICS 解析与展开（全天、定时、跨天、RRULE + EXDATE + RECURRENCE-ID、VTIMEZONE、仅 IANA TZID、浮动时间、取消的日程、区间裁剪）；URL 校验与私网地址拦截；订阅 CRUD 与 events 端点（e2e，以本地 HTTP 服务充当日历源并开启私网放行）。
- api：日程按账号时区归日（跨天、跨时区、全天多日）与当天排序、时间文案。
- ui：Today 显示日程行；Calendar 格子显示日程色块；设置页添加 / 停用 / 删除订阅。

## Out of Scope

- 导出任务为 ICS 订阅、双向同步、Google OAuth、CalDAV、读取设备系统日历。
- 日程离线缓存（不进副本）、Android 后台拉取。
- 在日程上创建任务、Assistant 读取日程。
