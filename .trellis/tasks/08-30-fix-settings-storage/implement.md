# Implementation Plan — Fix settings preference storage & hydration

## Ordered Checklist

### Step 1: Normalization helper + tests

- [ ] Add `normalizePreferences(raw: unknown)` (whitelists: theme
      `light|dark|system`, language `zh|en`, weekStartsOn `0|1` — accepting
      `"0"`/`"1"` strings; missing fields → fall back to provided defaults).
- [ ] Unit tests: string `"0"` → 0, garbage → defaults, valid passthrough,
      partial objects.

Files: `packages/frontend/src/lib/utils/preferences.ts` (new), test alongside.

### Step 2: Unified preferences store

- [ ] Extend `PreferencesState` with `theme`, `language` + actions.
- [ ] Switch persist to key `taskora-preferences`; `merge` uses
      `normalizePreferences`; add migration reading
      `taskora-theme` / `taskora-week-starts` / `taskora-lang`.
- [ ] `hydrateFromServer` routes server payload through
      `normalizePreferences` before `set`; missing fields keep current
      local values.
- [ ] Wire theme side effects (`applyTheme`, `resolved`, matchMedia
      listener) into the unified store; keep `useTheme` hook API and
      `applyThemeFromStorage` startup semantics (no FOUC regression).
- [ ] Keep `i18n.changeLanguage` side effect on language set + hydration;
      keep writing `taskora-lang` for rollback compatibility.
- [ ] Update `preferences.store.test.ts` for new shape + migration +
      server-hydration normalization cases.

Files: `packages/frontend/src/lib/stores/preferences.store.ts`,
`theme.store.ts` (absorb or shim), `lib/hooks/useTheme.ts`,
`main.tsx` if startup path changes.

### Step 3: Settings UI rollback

- [ ] `SettingsAppearance.tsx`: capture previous triple before optimistic
      set; `onError` restores it (plus existing toast).

Files: `packages/frontend/src/pages/SettingsAppearance.tsx`.

### Step 4: Auth snapshot cleanup

- [ ] `auth.store.ts` `partialize`: persist `user` without `preferences`.

Files: `packages/frontend/src/lib/stores/auth.store.ts`.

### Step 5: Verification

- [ ] `pnpm -C packages/frontend test` (or repo test script) — all pass.
- [ ] `pnpm -C packages/frontend lint` / typecheck clean.
- [ ] Manual smoke (dev server): dirty server prefs (string `"0"`,
      invalid theme) hydrate with correct highlight; failed save reverts
      selection.

## Validation Commands

```bash
pnpm -C packages/frontend test
pnpm -C packages/frontend run lint   # adjust to actual script name
```

## Review Gates

- After Step 2: confirm no FOUC regression on reload (light/dark/system).
- After Step 5: full-scope check via trellis-check before commit.

## Rollback Points

- Each step is a self-contained commit candidate; revert the step commit to
  roll back. Old localStorage keys are never deleted (rollback-safe).
