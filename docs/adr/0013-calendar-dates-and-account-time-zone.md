# Calendar dates and account time zone

Scheduled Date and Deadline are calendar dates, not instants. New clients write `YYYY-MM-DD`; existing REST DateTime columns encode those dates at UTC midnight. Reading that encoding must never apply the device's offset. Non-midnight legacy ISO values are decoded with a server-managed `legacyDateTimeZone`, captured at first initialization, because their original device zone was not retained. This decoding zone stays fixed when the account time zone changes, so old scheduled dates do not move.

An account-level IANA time zone determines today, settlement-day grouping, completion-anchored repetition, and reminder wall times. It defaults to the first device's zone and is persisted with user preferences; servers never use their own local zone for user calendar semantics. Real timestamps (settlement, audit, authentication, HLC) remain UTC instants.

This supersedes the UTC-day anchor assumption in the recurring-tasks implementation notes, not ADR-0012's deterministic id design: repeat arithmetic still runs on plain day keys, with instant-to-day conversion performed explicitly in the account zone before arithmetic. A time zone is not a fixed UTC offset: DST must be considered when resolving a reminder's date and wall time.

Preferences refresh on focus and every minute; calendar consumers update on preference changes and account midnight (30-second clock, also checked on focus), without remounting editors. Reminder registrations are immediately recalculated on zone changes. DST resolution uses Temporal's compatible policy: nonexistent wall times move forward by the gap, and repeated wall times use the earlier instant.

Changing the setting does not reschedule already-generated Repeat Instances. Offline devices keep their last synchronized preferences; changing zones while another device is offline can temporarily give the devices different completion-day anchors. The deterministic-id guarantee still requires the same rule, date inputs and calendar context. Existing v1 reopen limitations recorded in ADR-0012 remain.

A UTC-midnight legacy timestamp is indistinguishable from an already encoded calendar date; preserve its UTC date rather than guessing. Original dates lost through earlier faulty derivation cannot be reconstructed automatically.
