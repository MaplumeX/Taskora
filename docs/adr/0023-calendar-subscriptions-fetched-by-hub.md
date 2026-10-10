---
status: accepted
---

# Calendar subscriptions are fetched by the hub and stay out of the replica

Users want their meetings and appointments next to their tasks while they
plan a day, like Things 3's Calendar Events. We let them subscribe to an
external calendar by its iCal (ICS) link. Google, Outlook and iCloud all
publish one, so no OAuth, CalDAV or device calendar access is needed. Events
show read-only in Today, Upcoming (day groups and month groups) and Calendar.

## Decisions

- **The hub fetches and parses the feed, not the device.** Browsers cannot
  read Google's or Outlook's ICS URLs cross-origin (no CORS headers), and the
  three clients should behave the same way. The hub downloads the feed, parses
  it with `ical.js`, and keeps the parsed calendar in memory per subscription
  for 15 minutes. `GET /calendar/events?from&to` (date keys in the account
  zone, inclusive, at most 100 days: enough for Upcoming's whole span) expands recurrences into that range and
  returns every occurrence from the enabled subscriptions. When a fetch fails,
  the stale copy is served if there is one, and the error is recorded on the
  subscription so Settings can show it.
- **Subscriptions are a plain REST resource, not a synced entity.** A
  `CalendarSubscription` row has a name, URL, color, enabled flag and last
  fetch status. It is managed through `/calendar/subscriptions`, does not
  travel as Change Events and is not part of the Local Replica. Subscriptions
  change rarely, need the network anyway (the hub must reach the URL), and the
  URL is a secret that has no reason to sit in every device's SQLite file.
  Events are not stored anywhere: like Repeat Previews they are a projection,
  not Tasks. They have no checkbox, cannot be dragged or edited, are not part
  of Selection, and are hidden while a Tag filter is active.
- **Wire format: dates for all-day events, instants for timed ones.** All-day
  occurrences carry `start`/`end` date keys (end exclusive). Timed ones carry
  UTC instants. The client assigns timed events to every day they cover in
  the account time zone (ADR 0013); an event that ends exactly at midnight
  does not spill into the next day. On the hub, VTIMEZONE definitions in the
  file win. An IANA TZID without a definition is resolved in that zone (DST
  included), and floating times use the account zone. `STATUS:CANCELLED`
  events and occurrences are dropped.
- **The hub guards against SSRF.** The URL comes from the user and the hub
  makes the request, so: only http(s) is accepted (`webcal://` means
  `https://`); every resolved address is checked inside the socket's `lookup`
  (so DNS rebinding cannot slip past), and loopback, private, link-local,
  CGNAT and multicast ranges are refused; IP literals are checked directly;
  redirects are followed manually (at most 5) and each hop is checked again;
  requests time out after 15 s and bodies are capped at 10 MB. Self-hosters
  who want a calendar on their LAN set `CALENDAR_ALLOW_PRIVATE_NETWORK=true`.
  A subscription is only created after one successful fetch and parse, so a
  bad link is reported right away instead of failing quietly later.

## Considered Options

- **Devices fetch the feed themselves** (Tauri can make cross-origin requests).
  Rejected: web cannot, so we would need a hub proxy anyway, and every device
  would download and parse the same feed.
- **Store subscriptions as a synced entity.** Rejected for v1: it needs Engine
  schema, protocol and contract-test work for data that cannot be used
  offline anyway, and it would copy a secret URL onto every device.
- **Google OAuth / CalDAV.** Deferred: better freshness and private calendars
  without a secret link, but an OAuth app registration, token refresh and
  per-provider code. ICS links cover the main use case.

## Consequences

- Events are online-only. Offline, or when the request fails, Today, Upcoming
  and Calendar simply show no events. React Query keeps the last result for
  the session.
- Freshness is bounded by the hub cache (15 minutes) plus the provider's own
  publishing delay (Google can take hours to update secret iCal links).
- The cache is per hub instance. Several instances fetch the same feed
  independently. This is acceptable at this scale.
- Each request expands recurrences from DTSTART forward (up to 20,000
  iterations per event, 5,000 occurrences per response). This is fine for
  personal calendars, but a feed with decades of daily events pays for every
  iteration on every request.
