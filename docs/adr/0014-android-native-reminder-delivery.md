# Android reminder delivery owned by a native plugin

On Android, Reminder delivery moves out of JS and `tauri-plugin-notification` into a repo-local native plugin (`packages/mobile/plugins/reminders`). JS remains the single source of Reminder rules: it computes the full desired plan (key, epoch fireAt in the account time zone, title, body) and hands it over through one declarative, idempotent call, `sync(plan)`. The native side owns everything stateful: it persists the plan, diffs against its own persisted copy, arms exact alarms, re-arms after boot, package replacement and on every app start, posts the notification when an alarm fires, and manages the channel and permission state. Desktop keeps the runtime scheduler and `tauri-plugin-notification`.

This replaces the imperative design (JS kept an in-memory `registered` map and called `schedule` / `cancel` per key). That design could not work reliably. The map disappeared with the process, while the system alarms persisted, so tasks completed or trashed elsewhere never had their alarm cancelled. `tauri-plugin-notification` 2.4.0 does not persist notifications created through `notify`, so nothing survives a reboot. Without an exact-alarm permission it silently falls back to inexact alarms on Android 12+, which can fire up to an hour late. Several fix rounds (#83, #94, #98) repaired the JS call chain without touching these native-layer causes.

Rejected alternatives. Server-side push (vendor channels such as Xiaomi, Huawei, OPPO and vivo, plus FCM) is the most reliable option against aggressive OEM process killing, and it would also deliver reminders set on another device while the phone app was never opened. It requires a backend reminder scheduler, per-vendor SDKs and registration that may conflict with sideloaded distribution, so it is deferred to a separate spec, taken up only if native delivery proves insufficient on real devices. Mirroring reminders into the system calendar was rejected: it needs calendar permission, pollutes the user's calendar, and the notification is delivered by the calendar app.

Accepted limits. A phone only knows about reminders synced before the app was last opened. Reminders missed while the device was off are dropped, matching the desktop rule. On OEM ROMs where swiping the app away force-stops it, alarms are lost until the next app start unless the user allows autostart and unrestricted battery use; the app guides the user there but cannot guarantee it.

## Amendment (2026-09-28): notification actions

The reminder-actions spec adds "Complete", "In 15 minutes" and "Later…" (1 hour / tomorrow) buttons to Reminder notifications, and makes tapping the notification open the Task. Button taps are handled natively, without starting the app process. The native side dismisses the notification. For Complete it cancels the key's alarm. For Snooze it re-arms the key's alarm at the new time, so the reminder fires again even if JS never runs. It then appends `{ taskId, action, firedFireAt, tappedAt }` to a persisted action queue. JS takes the queue (`takePendingActions`) before each plan computation, applies every entry through the Reminder Action rules, and only then calls `sync`. While the queue holds an entry for a key, `sync` does not cancel that key's snoozed alarm.

JS stays the single source of Reminder rules. Native computes only "tap time plus a fixed duration, rounded up to the minute", which is the same arithmetic JS uses. For "tomorrow" it uses `snoozeTomorrowAt`, which JS precomputes for each plan item in the account time zone. Whether an action still applies (the Task has not been settled, trashed, or rescheduled elsewhere) is decided only in JS. A stale Snooze is discarded there, and the next `sync` withdraws its temporary alarm.

## Amendment (2026-09-30): background plan sync

Local-first-v3 issue 09 lifts the limit that a phone only knows reminders synced before the app was last opened. A WorkManager periodic task (15 minutes, network connected, battery not low) fetches the complete plan from the hub (`GET /reminders/plan`) and hands it to the same native plan replacement that `sync(plan)` uses. It does not run JS or the Engine and does not write the replica; the replica syncs normally the next time the app opens.

The Reminder rules move from JS into the shared domain (`packages/engine/src/domain/reminders.ts`, local-first-v3 issue 04). The coordinator on the device and the hub compute the plan with the same `planReminderDeliveries`, so the rules still have a single source. The hub computes from Postgres in the account time zone. Titles and bodies do not depend on the language. Action labels stay as the JS-provided copy persisted natively.

The background task authenticates with a per-device, read-only background token. The token is issued by `POST /sync/devices` (`backgroundToken: true`), stored hashed, rotated on every registration and valid for 30 days. It is not the session token, because refreshing the session natively would race JS for the refresh token rotation. On 401 the task disables itself, and logout (`clear`) disables it as well.

The native plan now has two writers, and the newer one wins. JS attaches a basis to every `sync`: the replica cursor and whether the Outbox still holds local writes. The hub plan carries the change-log cursor it was computed at.
- While the Outbox holds local writes, the background task does not overwrite, because the hub plan lacks those writes.
- While the replica cursor is behind the last background plan and there are no local writes (the app was opened offline), JS does not overwrite.
- A background fetch that overlaps a JS `sync` is discarded.
- Keys with queued notification actions are left to JS on both paths.

The remaining accepted limits are timeliness under Doze and app standby (maintenance windows, possibly hours), OEM ROMs that force-stop the app (WorkManager work is lost with the alarms), and changes made within one period of the fire time. Server push stays deferred as before; if it is taken up, a push only needs to trigger the same worker.
