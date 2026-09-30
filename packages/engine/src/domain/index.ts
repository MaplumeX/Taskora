/**
 * 领域规则（local-first-v3 issue 04）：设备的 Engine 后端与 hub 的 REST
 * 服务共用的纯函数。两端都只做「读 → 调这里 → 写」，规则只有这一份；
 * 存储相关的部分（SQL 粗筛、排序位次的分配、Prisma / 副本的写法）留在
 * 各自一侧。
 */

export { resolveProjectBucket, resolveTaskBucket } from './bucket';
export {
  dateKeyOf,
  instantMs,
  todayKey,
  type CalendarContext,
  type CalendarZones,
} from './calendar';
export { effectivePosition, sortByEffectivePosition, type Positioned } from './order';
export {
  countProjectTasks,
  feedIncludesProjects,
  projectMatchesView,
  sortFeedItems,
  sortForView,
  taskMatchesQuery,
  taskMatchesView,
  viewNeedsCalendar,
  type CountedTaskFields,
  type ListView,
  type TaskListQuery,
  type TaskQueryFields,
  type TaskViewFields,
  type ViewFields,
} from './views';
export {
  planTaskSearch,
  searchNeedle,
  taskInSearchScope,
  taskSearchRank,
  type PlannedSearchHit,
  type SearchSubtaskFields,
  type SearchTaskFields,
  type TaskSearchOptions,
} from './search';
export {
  planConvertTaskToProject,
  planTaskComplete,
  planTaskCreate,
  planTaskUpdate,
  subtaskStatusPatch,
  taskCancelPatch,
  taskReopenPatch,
  taskRestorePatch,
  taskTrashPatch,
  type ConvertedProjectFields,
  type TaskFields,
  type TaskPatch,
  type TaskUpdateBase,
} from './tasks';
export {
  planEmptyTrash,
  planProjectCreate,
  planProjectRestore,
  planProjectTrash,
  planProjectUpdate,
  projectCompletePatch,
  projectReopenPatch,
  type ProjectFields,
  type ProjectPatch,
} from './projects';
export {
  HeadingLayoutMismatchError,
  headingUnarchivePatch,
  isLayoutTask,
  planHeadingArchive,
  planHeadingDelete,
  planHeadingLayout,
  planHeadingToProject,
  sortHeadings,
  type HeadingLayout,
} from './headings';
export {
  planRepeatInstance,
  planRepeatSkip,
  repeatDerivationTarget,
  repeatInstanceId,
  RepeatSkipBlockedError,
  type PlannedIdState,
  type RepeatParent,
  type RepeatSkipBlock,
  type RepeatSkipSource,
  type RepeatSubtaskFields,
} from './repeat-instance';
export {
  buildRepeatPreviews,
  type RepeatPreview,
  type RepeatPreviewSource,
} from './repeat-preview';
export {
  buildReminderTexts,
  computeReminderPlan,
  diffReminderRegistration,
  isReminderEligible,
  planReminderDeliveries,
  reminderFireAt,
  reminderNotificationKey,
  reminderTextContext,
  snoozeTomorrowAt,
  type ReminderDelivery,
  type ReminderNotification,
  type ReminderParentTitles,
  type ReminderRegistrationDiff,
  type ReminderTaskInput,
  type ReminderTextContext,
  type ReminderTexts,
} from './reminders';
