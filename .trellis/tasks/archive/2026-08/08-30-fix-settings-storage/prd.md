# Fix settings preference storage & hydration

## Background

User reports: a settings option they remember selecting shows no option as
selected (no button highlighted). Root cause analysis found the settings
(theme / language / weekStartsOn) data flow has these defects:

1. `hydrateFromServer` in `preferences.store.ts` writes server data into the
   store WITHOUT the `merge` normalization. The server `User.preferences`
   column is a schemaless Prisma `Json` column, so legacy/dirty values
   (e.g. string `"0"` for weekStartsOn, invalid theme/language) pass straight
   into the store. UI selected-state uses strict equality
   (`weekStartsOn === opt.value`), so `"0"` matches neither 0 nor 1 —
   no option appears selected.
2. Local-first write with no rollback: `SettingsAppearance.tsx` mutates the
   local store first, then calls the server; on server failure it only shows
   a toast, leaving local and server permanently divergent. On next
   login/session-recovery, `hydrateFromServer` overwrites local with server
   values — the user's setting "mysteriously reverts".
3. Preferences are scattered across 5 storage locations
   (`taskora-theme`, `taskora-week-starts`, `taskora-lang` localStorage keys,
   DB Json column, plus a stale `user.preferences` copy inside the
   `taskora-auth` persisted snapshot that is never read).

## Requirements

### R1: Normalize server preferences on hydration (bug fix, core)

- `hydrateFromServer` must validate/normalize `theme`, `language`,
  `weekStartsOn` against the same whitelist used by the persist `merge`
  (fallback to defaults for invalid/missing values) before writing to the
  store.
- Dirty values from the server must never reach store state.

### R2: Rollback local state on save failure

- When a preference update (`updatePreferences.mutate`) fails, the local
  store change must be rolled back to the previous value, keeping local and
  server consistent (toast stays).

### R3: Single source of truth for preferences (consolidation)

- Merge `theme` + `weekStartsOn` (and language key if practical) into a
  single persisted preferences store / single localStorage key, migrating
  existing keys on rehydration (read old keys if new key absent).
- Remove the unused `preferences` field from the persisted auth snapshot
  (`partialize` in `auth.store.ts`) so no stale copy remains.

## Acceptance Criteria

- [ ] With server preferences containing `weekStartsOn: "0"` (string), the
      appearance settings still shows Sunday selected (normalized to 0),
      and calendar does not produce Invalid Date.
- [ ] With server preferences containing invalid theme (e.g. `"blue"`) or
      language, defaults are applied and UI highlights a valid option.
- [ ] Simulating a failed `updatePreferences` request reverts the local
      selection; no silent divergence remains.
- [ ] Existing users' old localStorage keys (`taskora-theme`,
      `taskora-week-starts`, `taskora-lang`) are migrated on first load
      after upgrade; settings visibly unchanged.
- [ ] Persisted auth snapshot no longer contains a `preferences` field.
- [ ] Frontend unit tests cover the normalization and rollback paths;
      existing tests pass.

## Out of Scope

- Backend schema changes (splitting the Json column into typed columns).
- Offline/queued preference sync.
- i18n cache behavior changes beyond the storage-key migration.
