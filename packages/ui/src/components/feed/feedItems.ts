import type { FeedItem, ProjectResponseDto, TaskResponseDto } from '@taskora/shared';

/** 任务 DTO → feed 条目（与 Project 混排的列表用）。 */
export function taskFeedItem(task: TaskResponseDto): FeedItem {
  return { ...task, type: 'task', tags: task.tags ?? [] };
}

/** 项目 DTO → feed 条目。 */
export function projectFeedItem(project: ProjectResponseDto): FeedItem {
  return {
    ...project,
    type: 'project',
    // Project 不设 Reminder / Repeat Rule（CONTEXT.md）
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    tags: project.tags ?? [],
  };
}
