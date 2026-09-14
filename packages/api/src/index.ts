// @taskora/api — cross-client data layer
// API client + token storage abstraction + Query hooks + auth flow +
// i18n resources + shared UI-agnostic stores/utils.

// API client & configuration
export {
  apiClient,
  setApiBaseUrl,
  setUnauthorizedHandler,
  setClientKind,
  getClientKind,
  type ClientKind,
} from './api/client';

// Token storage abstraction
export {
  type TokenStore,
  noopTokenStore,
  configureTokenStore,
  getTokenStore,
  readRefreshToken,
  writeRefreshToken,
} from './token-store';

// Web (localStorage) token store implementation
export {
  useLocalTokenStore,
  createLocalTokenStore,
  readLegacyAuthSnapshot,
  clearLocalToken,
  type LegacyAuthSnapshot,
} from './local-token-store';

// Auth store & flow
export { useAuthStore, hydrateAuthSnapshot, type AuthUser } from './stores/auth.store';
export {
  authKeys,
  useLogin,
  useRegister,
  useCurrentUser,
  useLogout,
  setAuthFlowNavigation,
  type AuthFlowNavigation,
} from './hooks/useAuth';

// API modules
export * from './api/auth.api';
export * from './api/areas.api';
export * from './api/feed.api';
export * from './api/project-headings.api';
export * from './api/projects.api';
export * from './api/tag-groups.api';
export * from './api/tags.api';
export * from './api/tasks.api';
export * from './api/users.api';

// Query hooks
export * from './hooks/useAreas';
export * from './hooks/useFeed';
export * from './hooks/useProjectHeadings';
export * from './hooks/useProjects';
export * from './hooks/useTagGroups';
export * from './hooks/useTags';
export * from './hooks/useTasks';
export * from './hooks/useDueTasksQuery';
export * from './hooks/useUsers';
export * from './hooks/useContentBottomActions';
export * from './hooks/useContentBottomActionsRoute';
export * from './hooks/useTaskRowSelection';
export * from './hooks/usePageTaskContext';

// UI-agnostic UI state stores
export { useUiInteractionStore, type SettingsTab } from './stores/uiInteraction.store';
export { useProjectUiPrefsStore } from './stores/projectUiPrefs.store';

// Preferences (theme / language / week start)
export { usePreferencesStore, hydrateFromServer } from './stores/preferences.store';
export { useTheme } from './hooks/useTheme';
export { applyTheme, applyThemeFromStorage } from './stores/preferences.store';

// Utilities
export * from './utils/date';
export {
  normalizePreferences,
  isValidLanguage,
  type ValidPreferences,
  type PreferencesDefaults,
  type ThemeMode,
  type Language,
} from './utils/preferences';
export * from './utils/calendarGrid';
export * from './utils/upcomingLayout';
export { useDebouncedValue } from './hooks/useDebouncedValue';

// i18n
export { i18n, defaultNS, namespaces } from './i18n/config';
