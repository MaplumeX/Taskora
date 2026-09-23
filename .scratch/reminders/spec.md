# Feature: Reminders (通知提醒)

Status: ready-for-agent

## Problem Statement

用户给 Task 计划了日期之后，到了当天却没有任何提醒——必须主动打开 Taskora 查看今天/计划视图才知道该做什么。用户希望在设置计划日期的 Popover 里顺手设一个提醒时刻，到点由设备发出系统通知，就像 Things 3 那样。

## Solution

在 `ScheduledDateField` Popover（日历 + Today/Someday/Clear）中，当 Task 的 ScheduledType 为 DATE 时，日历下方新增提醒区：一个提醒开关 + 时间选择器。开启后到点由 Desktop / Mobile 客户端本地触发系统通知。设了提醒的 Task 在列表行上显示时钟图标 + HH:mm 的 badge。

## User Stories

1. As a Taskora user, I want to turn on a reminder while scheduling a Task, so that I get a system notification at the chosen time without leaving the scheduling Popover.
2. As a Taskora user, I want the reminder time to default to 09:00 when I first enable it, so that I don't have to pick a time for the common case.
3. As a Taskora user, I want to change the reminder time with a time picker, so that it fires at the exact moment I choose.
4. As a Taskora user, I want to turn the reminder off, so that a scheduled Task no longer notifies me.
5. As a Taskora user, I want the reminder section hidden when my Task is Someday or unscheduled, so that the Popover doesn't offer something that can't work.
6. As a Taskora user, I want my reminder cleared automatically when my Task moves to Someday or becomes unscheduled, so that stale reminders never fire.
7. As a Taskora user, I want my reminder cleared automatically when my Task is settled (Completed or Cancelled) or trashed, so that I'm not notified about finished work.
8. As a Taskora user, I want to move a Task to another date and keep its reminder time, so that the reminder fires at the same time on the new day.
9. As a Taskora user, I want a clock icon with HH:mm shown on the Task row when a reminder is set, so that I can see at a glance which Tasks will notify me.
10. As a mobile user, I want reminders to fire as system-level scheduled notifications even when the app is closed, so that I never miss one while offline.
11. As a desktop user, I want reminders to fire while the desktop app is running, so that I'm notified at the right moment.
12. As a desktop user whose app was closed at reminder time, I accept that the missed reminder is silently dropped (not replayed on next launch), so that I'm not spammed by a burst of stale notifications.
13. As a multi-device user, I want the reminder to fire on each device that has it enabled, so that I'm reliably reached (duplicate notifications across devices are acceptable, matching Things 3 behavior).
14. As a user, I want to be asked for notification permission the first time I enable a reminder (not at app launch), so that I understand why the permission is needed before granting it.
15. As a user who denied notification permission, I want to still be able to save a reminder time, so that my intent isn't lost — with a visible notice that notifications are disabled and a way to open system settings.
16. As a user, I want tapping a reminder notification to open/focus the app, so that I can get back to my tasks with one tap.
17. As a user, I want my reminder synced across devices via the existing field-level sync, so that editing a reminder on one device carries to the others.
18. As a web (frontend) user, I understand reminders are not available in this version, so that scope stays focused on desktop and mobile.

## Implementation Decisions

### Domain model

- New Task field `reminderTime` — a time-of-day (HH:mm), no date, no timezone. It attaches to the Task's Scheduled Date and is interpreted in the device's local timezone.
- Term **Reminder** is defined in CONTEXT.md: a time-of-day on a Task, attached to its Scheduled Date, triggering local client notifications; only Tasks with ScheduledType DATE can have one. Projects do not support Reminders.
- Reminder is cleared when: the Task is settled (Completed/Cancelled) or trashed; or ScheduledType changes away from DATE (Someday/NONE).
- Changing the Scheduled Date keeps reminderTime unchanged (fires at the same time on the new day).
- Default time when first enabling: 09:00 (fixed, not a preference).

### UI

- `ScheduledDateField` gains a reminder section below the calendar, visible only for Tasks with ScheduledType DATE. The field component is shared with Projects, so it takes a flag to enable/disable the reminder section (disabled for Projects).
- The reminder section is a toggle + native time input (`<input type="time">`), visually styled to match the existing field design.
- Task rows show a clock icon + HH:mm badge when reminderTime is set (alongside the existing date badge), in all views including Today/Scheduled.

### Notifications

- Desktop + Mobile only; Web (frontend) gets no notification behavior this version; Backend does not participate in triggering.
- Add `tauri-plugin-notification` to both desktop and mobile Tauri apps.
- Mobile registers system-level scheduled notifications (fire offline, app closed). Desktop fires from a runtime scheduler while the app is running; missed reminders are silently dropped, never replayed.
- Notification permission is requested at first reminder enable, not at app launch. If denied, reminderTime can still be saved; the reminder section shows a "notifications disabled" notice with a jump-to-system-settings action.
- Tapping a notification only opens/focuses the app — no deep link to the specific Task (deferred; needs task-routing infrastructure).

### Sync / engine

- `reminderTime` participates in the existing field-level HLC last-write-wins merge (mergeFieldWrites / mergeEntityState). No special merge rules.

### New seam: Reminder Scheduler

- One new module: a pure client-side scheduler. Input: the set of tasks (scheduled date + reminderTime + terminal state) and current time. Output: the set of system notifications that should be registered/cancelled. The Tauri notification API sits outside this module behind a thin mockable shell.
- Clearing rules (settle/trash clears, date change keeps) are enforced in this layer and in the field patch flow.

## Testing Decisions

- Test external behavior only, not implementation details. Prefer the highest seam.
- UI seam (existing): component tests in the style of TaskRowExpanded.test.tsx / ProjectMetaRow.test.tsx — reminder toggle visible only for DATE-type Tasks, not for Projects; time input patches reminderTime; toggle-off clears; clock badge on Task rows.
- Data seam (existing): reminderTime flows through mergeFieldWrites LWW like any field; covered by existing engine merge tests, no new seam.
- New seam: Reminder Scheduler pure-logic tests — given tasks and current time, expected register/cancel set; clearing rules on settle/trash/Someday; keep-time-on-date-change. Tauri notification shell is mocked.
- Prior art: vitest component tests in packages/ui, engine merger tests in packages/engine.

## Out of Scope

- Web (frontend) notifications (browser Notification API / Web Push).
- Backend-driven push notifications or scheduled scanning.
- Reminder for Projects.
- Custom time-picker wheel UI (native time input only; wheel may come later).
- Deep-linking from a notification to a specific Task.
- User-configurable default reminder time.
- Missed-reminder replay/catch-up on desktop launch.
- Snooze / repeating reminders.

## Further Notes

- Timezone semantics: Scheduled Date + reminderTime interpreted in device local timezone; no timezone stored. Cross-timezone travel may shift the wall-clock firing time; accepted for this version.
- Duplicate notifications across multiple devices are expected and accepted (matches Things 3).
- CONTEXT.md has been updated with the Reminder term during the design session.
