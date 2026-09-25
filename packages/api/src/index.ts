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
  withSessionLock,
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
export { setTaskBackend, currentTaskBackend, type TaskBackend } from './api/task-backend';
export { createEngineTaskBackend } from './engine/task-backend.engine';
export {
  setProjectBackend,
  currentProjectBackend,
  type ProjectBackend,
} from './api/project-backend';
export { createEngineProjectBackend } from './engine/project-backend.engine';
export { setAreaBackend, currentAreaBackend, type AreaBackend } from './api/area-backend';
export { createEngineAreaBackend } from './engine/area-backend.engine';
export { setTagBackend, currentTagBackend, type TagBackend } from './api/tag-backend';
export { createEngineTagBackend } from './engine/tag-backend.engine';
export {
  setTagGroupBackend,
  currentTagGroupBackend,
  type TagGroupBackend,
} from './api/tag-group-backend';
export { createEngineTagGroupBackend } from './engine/tag-group-backend.engine';
export {
  setProjectHeadingBackend,
  currentProjectHeadingBackend,
  type ProjectHeadingBackend,
} from './api/project-heading-backend';
export { createEngineProjectHeadingBackend } from './engine/project-heading-backend.engine';
export * from './api/users.api';
export * from './api/agent.api';
export { subscribeAgentEvents } from './api/agent-sse';

// Event Stream (Change Event push sync, ADR 0005)
export { applyChangeEvents, dedupeEvents, EventStreamApplier } from './events/event-applier';
export {
  initEventStream,
  destroyEventStream,
  onRemoteChangeEvent,
  setEventStreamCacheSurgery,
} from './events/event-stream-client';
export { taskMatchesQuery } from './events/task-query-match';

// Query hooks
export * from './hooks/useAreas';
export * from './hooks/useFeed';
export * from './hooks/useProjectHeadings';
export * from './hooks/useProjects';
export * from './hooks/useTagGroups';
export * from './hooks/useTags';
export * from './hooks/useTasks';
export * from './hooks/useScheduledTasksQuery';
export * from './hooks/useUsers';
export * from './hooks/useAgent';
export * from './hooks/useContentBottomActions';
export * from './hooks/useContentBottomActionsRoute';
export * from './hooks/useTaskRowSelection';
export * from './hooks/useSelectionScope';
export * from './hooks/usePageTaskContext';

// UI-agnostic UI state stores
export { useUiInteractionStore, type SettingsTab } from './stores/uiInteraction.store';
export { useSyncStatusStore, setSyncStatus, type SyncStatus } from './stores/sync-status.store';
export {
  useSelectionStore,
  flattenSelectionRows,
  type SelectionRow,
  type SelectionRowKind,
  type SelectionRowGroupHeader,
} from './stores/selection.store';
export { useProjectUiPrefsStore } from './stores/projectUiPrefs.store';

// Preferences (theme / language / week start)
export { usePreferencesStore, hydrateFromServer } from './stores/preferences.store';
export { useTheme } from './hooks/useTheme';
export { applyTheme, applyThemeFromStorage } from './stores/preferences.store';

// Reminders（reminders spec）：纯调度计算 + 通知薄壳 + 协调器 + 权限 store
export {
  computeReminderPlan,
  diffReminderRegistration,
  reminderNotificationKey,
  type ReminderTaskInput,
  type ReminderNotification,
  type ReminderRegistrationDiff,
} from './reminders/reminder-scheduler';
export {
  setNotificationShell,
  getNotificationShell,
  notificationIdForKey,
  reminderInputFromReplicaRow,
  type ReminderNotificationShell,
} from './reminders/notification-shell';
export {
  createReminderCoordinator,
  type ReminderCoordinator,
  type ReminderCoordinatorOptions,
} from './reminders/reminder-coordinator';
export {
  useReminderPermissionStore,
  type ReminderPermissionState,
} from './reminders/permission.store';

// Utilities
export * from './utils/date';

// Repeat Rule 纯函数（recurring-tasks spec）：规则编辑器的实时预览与
// 规范化写入共用 @taskora/engine 的同一实现（跨端派生 id 一致的前提）。
export { normalizeRepeatRule, nextOccurrenceDate } from '@taskora/engine';
export { setAppVersion, getAppVersion } from './utils/appInfo';
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
export * from './utils/logbookLayout';
export { useDebouncedValue } from './hooks/useDebouncedValue';

// i18n
export { i18n, defaultNS, namespaces } from './i18n/config';
