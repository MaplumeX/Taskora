# Design — Fix settings preference storage & hydration

## Goals

- Server-side preference data is always normalized before entering client state.
- Local optimistic updates roll back on server failure.
- One persisted store / one localStorage key for user preferences.

## Non-Goals

- Backend schema changes (Json column stays).
- Offline sync queue.

## Current State (as-is)

- `preferences.store.ts` (zustand persist, key `taskora-week-starts`): holds
  `weekStartsOn` only; `merge` normalizes persisted localStorage value;
  `hydrateFromServer(prefs)` applies theme/language/weekStartsOn from server
  with NO normalization (bug 1).
- `theme.store.ts` (key `taskora-theme`): holds `mode` + `resolved`;
  module-level matchMedia listener re-resolves `system`.
- i18next language detector (key `taskora-lang`).
- `auth.store.ts` persists `user` (incl. stale `preferences`) under
  `taskora-auth`.
- `SettingsAppearance.tsx`: local-first writes + `updatePreferences.mutate`
  with toast-only error handling (bug 2).

## Target Design

### 1. Unified preferences store (`preferences.store.ts` refactor)

State:

```ts
interface PreferencesState {
  theme: ThemeMode;        // 'light' | 'dark' | 'system'
  language: 'zh' | 'en';
  weekStartsOn: 0 | 1;
  // actions
  setTheme / setLanguage / setWeekStartsOn
  hydrateFromServer(prefs: UserPreferences | null)
}
```

Single persist key `taskora-preferences`, `partialize` to
`{ theme, language, weekStartsOn }`.

**Normalization module** (`lib/utils/preferences.ts` or inside store file):

```ts
normalizePreferences(raw: unknown): { theme, language, weekStartsOn }
```

Strict whitelists, defaults `theme: 'system'`, `language: 'zh'` (matches
current app default) — actually keep existing default `weekStartsOn: 1`;
language default follows current i18n fallback behavior (`en`? verify —
detector order is localStorage → navigator; server default should match
`UserPreferences` defaults; pick `'en'` to match `fallbackLng`, or keep
detector result when server value missing). Decision: normalize only
validates; missing fields fall back to the store's current value rather than
hardcoding, so local values survive partial server payloads.

Used by BOTH the persist `merge` (localStorage rehydration) AND
`hydrateFromServer` (server data) — single entry point (fixes bug 1).

**Theme side effects**: `setTheme` and hydration call `applyTheme()` /
update `resolved`; keep the existing matchMedia listener but drive it off
the unified store. `theme.store.ts` either becomes a thin re-export or is
absorbed; keep `useTheme` hook API (`mode`, `setMode`, `cycle`) stable to
avoid touching all consumers.

**Language side effects**: `setLanguage`/hydration call
`i18n.changeLanguage` and keep writing the i18n detector key
(`taskora-lang`) in sync during migration period so a rollback to the old
build still resolves language; after migration the unified key is
authoritative.

**Migration** (one-time, on rehydrate when `taskora-preferences` absent):

1. Read `taskora-theme` → `mode` (validate).
2. Read `taskora-week-starts` → `weekStartsOn` (validate via existing rules).
3. Read `taskora-lang` → `language` (validate `zh`/`en`).
4. Write unified state; leave old keys in place (rollback safety) — they are
   ignored once the unified key exists.

### 2. Rollback on save failure

`SettingsAppearance.tsx` handlers change to:

```ts
const prev = { theme, language, weekStartsOn }; // from store
setX(value);
updatePreferences.mutate({ x: value }, {
  onError: () => { restore(prev); toast.error(...); },
});
```

Rollback restores the exact prior triple (simple, no server round-trip).
Same pattern for all three settings.

### 3. Auth snapshot cleanup

`auth.store.ts` `partialize` keeps persisting `user` (needed for session
recovery UX) — but strip `preferences` from the persisted shape? The
`UserResponseDto` includes `preferences`; simplest: keep `user` but the
recovery path already refreshes from server. Decision: leave `user` as-is
except `preferences: undefined` is NOT valid (changes DTO shape at runtime).
Instead: persist user minus preferences via a small mapping
(`const { preferences, ...rest } = user`). Consumers that read
`useAuthStore(s => s.user)` never read `preferences` (verified: only
`useAuth.ts` reads `query.data.preferences`, not the snapshot). Safe.

## Data Flow (after)

```
localStorage(taskora-preferences) --merge+normalize--> store ──> UI
server User.preferences --hydrateFromServer+normalize--> store ──> UI
UI action --setX--> store (optimistic) --mutate--> server
                     └─ onError: rollback to prev triple
```

## Trade-offs / Risks

- Absorbing theme store touches the matchMedia listener + FOUC-sensitive
  startup path (`applyThemeFromStorage` in `main.tsx`); keep that function
  working off the unified store with the same synchronous semantics.
- Language key duplication (i18n detector key + unified key) during
  migration: acceptable, documented.
- Old keys left in localStorage: harmless, avoids breaking rollback.

## Rollout / Rollback

- Pure frontend change; deploy with the app. Rollback = revert commit; old
  keys were never deleted, so old build resumes working.
