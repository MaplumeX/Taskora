import { Injectable } from '@nestjs/common';
import { Type } from 'typebox';
import { ScheduledType, TaskStatus, ProjectBucket } from '@taskora/shared';
import type { TaskView } from '../../tasks/views';

import { TasksService } from '../../tasks/tasks.service';
import { ProjectsService } from '../../projects/projects.service';
import { AreasService } from '../../areas/areas.service';
import { TagsService } from '../../tags/tags.service';
import { TagGroupsService } from '../../tag-groups/tag-groups.service';
import { SubtasksService } from '../../subtasks/subtasks.service';
import { ProjectHeadingsService } from '../../project-headings/project-headings.service';
import { FeedService } from '../../feed/feed.service';
import {
  defineTool,
  compact,
  textResult,
  summarizeList,
  type TaskoraAgentTool,
} from './taskora-tool';

/**
 * Builds the Agent tool set for one user. Every tool closes over the request
 * user's `userId` and delegates to the existing services, so cross-user access
 * is impossible no matter what arguments the model produces.
 *
 * Only irreversible operations carry `destructive: true` and go through the
 * approval interceptor: `empty_trash` (permanent delete), `delete_area`
 * (hard delete) and `delete_project_heading` (hard delete). Soft deletes
 * (delete_task / delete_project → trash, restorable) and reversible
 * structure changes (create/update area/project/heading) run without an
 * approval card to keep the approval signal meaningful.
 */

const LIST_LIMIT = 40;

const taskViewSchema = Type.Union([
  Type.Literal('inbox'),
  Type.Literal('today'),
  Type.Literal('upcoming'),
  Type.Literal('anytime'),
  Type.Literal('someday'),
  Type.Literal('trash'),
  Type.Literal('logbook'),
]);

const scheduledTypeSchema = Type.Union([
  Type.Literal('NONE'),
  Type.Literal('DATE'),
  Type.Literal('SOMEDAY'),
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools are a heterogeneous set by design
export type AnyAgentTool = TaskoraAgentTool<any>;

/**
 * Read-only tools are named `list_*` / `get_*` / `search_*`; every other
 * tool mutates the user's data. The runtime uses this to emit `data_changed`
 * SSE events so clients can refetch their domain caches.
 */
const READ_ONLY_TOOL_NAME = /^(list_|get_|search_)/;

export function isReadOnlyToolName(name: string): boolean {
  return READ_ONLY_TOOL_NAME.test(name);
}

@Injectable()
export class AgentToolsService {
  constructor(
    private readonly tasks: TasksService,
    private readonly projects: ProjectsService,
    private readonly areas: AreasService,
    private readonly tags: TagsService,
    private readonly tagGroups: TagGroupsService,
    private readonly subtasks: SubtasksService,
    private readonly projectHeadings: ProjectHeadingsService,
    private readonly feed: FeedService,
  ) {}

  /**
   * Best-effort resolution of entity ids in tool-call args to entity titles,
   * for the approval card snapshot (show names, not database ids). Ids that
   * match nothing are simply left out.
   */
  async resolveCallLabels(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const ids = new Set<string>();
    for (const [key, value] of Object.entries(args)) {
      if (key === 'tagIds' && Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') ids.add(item);
        }
      } else if ((key === 'id' || /Id$/.test(key)) && typeof value === 'string') {
        ids.add(value);
      }
    }
    if (ids.size === 0) return {};

    const labels: Record<string, string> = {};
    await Promise.all(
      [...ids].map(async (id) => {
        // The `id` arg is ambiguous across entity types: try each service in
        // turn and keep the first hit.
        const lookups: Array<() => Promise<{ title?: string | null }>> = [
          () => this.projectHeadings.findOne(userId, id),
          () => this.areas.findOne(userId, id),
          () => this.projects.findOne(userId, id),
          () => this.tasks.findOne(userId, id),
          () => this.tags.findOne(userId, id),
        ];
        for (const lookup of lookups) {
          try {
            const found = await lookup();
            if (found.title) labels[id] = found.title;
            return;
          } catch {
            // not this entity type; try the next
          }
        }
      }),
    );
    return labels;
  }

  /** Tool set bound to a single user. */
  build(userId: string): AnyAgentTool[] {
    return [
      // ---------------------------------------------------------------- read
      defineTool({
        name: 'list_areas',
        label: 'List areas',
        description:
          'List all areas (top-level life/work domains) of the user. Each area may hold projects and tasks.',
        parameters: Type.Object({}),
        execute: async () => {
          const areas = await this.areas.findAll(userId);
          return textResult(
            summarizeList(areas, LIST_LIMIT, (a) => compact({ id: a.id, title: a.title })),
          );
        },
      }),
      defineTool({
        name: 'list_projects',
        label: 'List projects',
        description:
          'List all active projects with their area, status, task counts and dates. Does not include trashed projects.',
        parameters: Type.Object({}),
        execute: async () => {
          const projects = await this.projects.findAll(userId);
          return textResult(
            summarizeList(projects, LIST_LIMIT, (p) =>
              compact({
                id: p.id,
                title: p.title,
                areaId: p.areaId,
                status: p.status,
                bucket: p.bucket,
                scheduledDate: p.scheduledDate,
                dueDate: p.dueDate,
                taskTotalCount: p.taskTotalCount,
                taskCompletedCount: p.taskCompletedCount,
              }),
            ),
          );
        },
      }),
      defineTool({
        name: 'get_project',
        label: 'Get project detail',
        description: 'Get one project by id, including its headings and tasks.',
        parameters: Type.Object({ id: Type.String({ description: 'Project id' }) }),
        execute: async (_id, params) => {
          const project = await this.projects.findOne(userId, params.id);
          const headings = await this.projectHeadings.findAll(userId, params.id, true);
          const tasks = await this.tasks.findAll(userId, { projectId: params.id, completed: true });
          return textResult({
            project: compact({
              id: project.id,
              title: project.title,
              notes: project.notes,
              areaId: project.areaId,
              status: project.status,
              bucket: project.bucket,
              scheduledDate: project.scheduledDate,
              dueDate: project.dueDate,
            }),
            headings: headings.map((h) => compact({ id: h.id, title: h.title, status: h.status })),
            tasks: tasks.map((t) =>
              compact({
                id: t.id,
                title: t.title,
                headingId: t.headingId,
                status: t.status,
                scheduledDate: t.scheduledDate,
              }),
            ),
          });
        },
      }),
      defineTool({
        name: 'list_tasks',
        label: 'List tasks',
        description:
          'List tasks, optionally filtered by a bucket view (inbox/today/upcoming/anytime/someday/trash/logbook), by project, by area, or by free-text query.',
        parameters: Type.Object({
          view: Type.Optional(taskViewSchema),
          projectId: Type.Optional(Type.String()),
          areaId: Type.Optional(Type.String()),
          q: Type.Optional(Type.String({ description: 'Free-text search in title and notes' })),
          includeCompleted: Type.Optional(
            Type.Boolean({
              description: 'Also return completed and cancelled tasks (default false)',
            }),
          ),
        }),
        execute: async (_id, params) => {
          const items = await this.tasks.findAll(userId, {
            view: params.view as TaskView | undefined,
            projectId: params.projectId,
            areaId: params.areaId,
            q: params.q,
            completed: params.includeCompleted ?? false,
          });
          return textResult(
            summarizeList(items, LIST_LIMIT, (t) =>
              compact({
                id: t.id,
                title: t.title,
                projectId: t.projectId,
                areaId: t.areaId,
                scheduledType: t.scheduledType,
                scheduledDate: t.scheduledDate,
                dueDate: t.dueDate,
                status: t.status,
                tags: t.tags?.map((tag) => tag.title),
              }),
            ),
          );
        },
      }),
      defineTool({
        name: 'get_task',
        label: 'Get task detail',
        description: 'Get one task by id, including notes, dates, tags and subtasks.',
        parameters: Type.Object({ id: Type.String({ description: 'Task id' }) }),
        execute: async (_id, params) => {
          const task = await this.tasks.findOne(userId, params.id);
          return textResult(
            compact({
              id: task.id,
              title: task.title,
              notes: task.notes,
              projectId: task.projectId,
              areaId: task.areaId,
              bucket: task.bucket,
              scheduledType: task.scheduledType,
              scheduledDate: task.scheduledDate,
              dueDate: task.dueDate,
              status: task.status,
              completedAt: task.completedAt,
              trashedAt: task.trashedAt,
              tags: task.tags?.map((tag) => tag.title),
              subtasks: task.subtasks?.map((s) =>
                compact({ id: s.id, title: s.title, status: s.status }),
              ),
            }),
          );
        },
      }),
      defineTool({
        name: 'list_tags',
        label: 'List tags and tag groups',
        description: 'List all tags (with color) and tag groups of the user.',
        parameters: Type.Object({}),
        execute: async () => {
          const [tags, groups] = await Promise.all([
            this.tags.findAll(userId),
            this.tagGroups.findAll(userId),
          ]);
          return textResult({
            tags: tags.map((t) => compact({ id: t.id, title: t.title, color: t.color })),
            tagGroups: groups.map((g) => compact({ id: g.id, title: g.title })),
          });
        },
      }),
      defineTool({
        name: 'list_feed',
        label: 'List feed view',
        description:
          'List a combined feed of tasks and projects for a view: today, upcoming, anytime, someday, inbox, logbook (completed and cancelled) or trash (soft-deleted, restorable).',
        parameters: Type.Object({
          view: Type.Union([
            Type.Literal('today'),
            Type.Literal('upcoming'),
            Type.Literal('anytime'),
            Type.Literal('someday'),
            Type.Literal('inbox'),
            Type.Literal('logbook'),
            Type.Literal('trash'),
          ]),
        }),
        execute: async (_id, params) => {
          const items = await this.feed.findAll(userId, params.view);
          return textResult(
            summarizeList(items, LIST_LIMIT, (i) =>
              compact({
                type: i.type,
                id: i.id,
                title: i.title,
                scheduledDate: 'scheduledDate' in i ? i.scheduledDate : undefined,
                status: 'status' in i ? i.status : undefined,
              }),
            ),
          );
        },
      }),
      defineTool({
        name: 'search',
        label: 'Search tasks and projects',
        description:
          'Full-text search across task titles/notes and project titles/notes. Returns matching non-trashed tasks (active, completed and cancelled) and projects (including completed). Trashed items are not searchable; use list_tasks with view=trash instead.',
        parameters: Type.Object({ q: Type.String({ description: 'Search query' }) }),
        execute: async (_id, params) => {
          const [taskResults, projects] = await Promise.all([
            this.tasks.findAll(userId, { q: params.q, completed: true }),
            this.projects.findAll(userId),
          ]);
          const needle = params.q.toLowerCase();
          return textResult({
            tasks: summarizeList(taskResults, LIST_LIMIT, (t) =>
              compact({ id: t.id, title: t.title, projectId: t.projectId }),
            ),
            projects: summarizeList(
              projects.filter(
                (p) =>
                  p.title.toLowerCase().includes(needle) ||
                  (p.notes ?? '').toLowerCase().includes(needle),
              ),
              LIST_LIMIT,
              (p) => compact({ id: p.id, title: p.title, areaId: p.areaId }),
            ),
          });
        },
      }),

      // ---------------------------------------------------------------- write
      defineTool({
        name: 'create_task',
        label: 'Create task',
        description:
          'Create a new task. Use scheduledType DATE + scheduledDate (ISO date) to schedule it, or SOMEDAY for someday. Assign it to a project and/or area to move it out of the inbox. tagIds attaches existing tags.',
        parameters: Type.Object({
          title: Type.String(),
          notes: Type.Optional(Type.String()),
          scheduledType: Type.Optional(scheduledTypeSchema),
          scheduledDate: Type.Optional(
            Type.String({ description: 'ISO date (YYYY-MM-DD). Requires scheduledType DATE.' }),
          ),
          dueDate: Type.Optional(Type.String({ description: 'ISO date (YYYY-MM-DD) deadline' })),
          projectId: Type.Optional(Type.String()),
          areaId: Type.Optional(Type.String()),
          tagIds: Type.Optional(Type.Array(Type.String())),
        }),
        execute: async (_id, params) => {
          const task = await this.tasks.create(userId, {
            title: params.title,
            notes: params.notes,
            scheduledType: params.scheduledType as ScheduledType | undefined,
            scheduledDate: params.scheduledDate,
            dueDate: params.dueDate,
            projectId: params.projectId,
            areaId: params.areaId,
            tagIds: params.tagIds,
          });
          return textResult(compact({ id: task.id, title: task.title, bucket: task.bucket }));
        },
      }),
      defineTool({
        name: 'update_task',
        label: 'Update task',
        description:
          'Update a task: rename, edit notes, change dates (scheduledDate/dueDate), move it to another project or area (null clears), complete/reopen, cancel/uncancel, or set its tags (tagIds replaces all tags).',
        parameters: Type.Object({
          id: Type.String(),
          title: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
          scheduledType: Type.Optional(scheduledTypeSchema),
          scheduledDate: Type.Optional(
            Type.Union([Type.String({ description: 'ISO date (YYYY-MM-DD)' }), Type.Null()]),
          ),
          dueDate: Type.Optional(
            Type.Union([Type.String({ description: 'ISO date (YYYY-MM-DD)' }), Type.Null()]),
          ),
          projectId: Type.Optional(
            Type.Union([Type.String({ description: 'Target project id' }), Type.Null()]),
          ),
          areaId: Type.Optional(
            Type.Union([Type.String({ description: 'Target area id' }), Type.Null()]),
          ),
          completed: Type.Optional(
            Type.Boolean({ description: 'true completes the task, false reopens it' }),
          ),
          cancelled: Type.Optional(
            Type.Boolean({
              description: 'true cancels the task (gives up on it, reversible), false uncancels it',
            }),
          ),
          tagIds: Type.Optional(
            Type.Array(Type.String(), { description: 'Replaces all task tags' }),
          ),
        }),
        execute: async (_id, params) => {
          if (params.completed !== undefined) {
            if (params.completed) {
              await this.tasks.complete(userId, params.id);
            } else {
              await this.tasks.uncomplete(userId, params.id);
            }
          }
          if (params.cancelled !== undefined) {
            if (params.cancelled) {
              await this.tasks.cancel(userId, params.id);
            } else {
              await this.tasks.uncancel(userId, params.id);
            }
          }
          const task = await this.tasks.update(userId, params.id, {
            title: params.title,
            notes: params.notes,
            scheduledType: params.scheduledType as ScheduledType | undefined,
            scheduledDate: params.scheduledDate,
            dueDate: params.dueDate,
            projectId: params.projectId,
            areaId: params.areaId,
            tagIds: params.tagIds,
          });
          return textResult(compact({ id: task.id, title: task.title, bucket: task.bucket }));
        },
      }),
      defineTool({
        name: 'create_subtask',
        label: 'Create subtask',
        description: 'Add a subtask (checklist step) to an existing task.',
        parameters: Type.Object({
          taskId: Type.String(),
          title: Type.String(),
        }),
        execute: async (_id, params) => {
          const subtask = await this.subtasks.create(userId, params.taskId, {
            title: params.title,
          });
          return textResult(
            compact({ id: subtask.id, title: subtask.title, taskId: subtask.taskId }),
          );
        },
      }),
      defineTool({
        name: 'complete_subtask',
        label: 'Complete subtask',
        description:
          'Mark a subtask as completed, cancel it (gives up on it, reversible), or reopen it with completed=false / cancelled=false.',
        parameters: Type.Object({
          id: Type.String(),
          completed: Type.Optional(
            Type.Boolean({ description: 'true completes the subtask, false reopens it' }),
          ),
          cancelled: Type.Optional(
            Type.Boolean({
              description: 'true cancels the subtask (gives up on it, reversible), false uncancels it',
            }),
          ),
        }),
        execute: async (_id, params) => {
          let subtask: Awaited<ReturnType<SubtasksService['complete']>>;
          if (params.cancelled !== undefined) {
            subtask = params.cancelled
              ? await this.subtasks.cancel(userId, params.id)
              : await this.subtasks.uncancel(userId, params.id);
          } else {
            subtask = await this.subtasks.update(userId, params.id, {
              status: (params.completed ?? true) ? TaskStatus.COMPLETED : TaskStatus.ACTIVE,
            });
          }
          return textResult(
            compact({ id: subtask.id, title: subtask.title, status: subtask.status }),
          );
        },
      }),
      defineTool({
        name: 'create_tag',
        label: 'Create tag',
        description:
          'Create a new tag, optionally with a hex color (e.g. #3B82F6) and a tag group. Use the returned id in task/project tagIds.',
        parameters: Type.Object({
          title: Type.String(),
          color: Type.Optional(Type.String()),
          tagGroupId: Type.Optional(Type.String()),
        }),
        execute: async (_id, params) => {
          const tag = await this.tags.create(userId, {
            title: params.title,
            color: params.color,
            tagGroupId: params.tagGroupId,
          });
          return textResult(compact({ id: tag.id, title: tag.title, color: tag.color }));
        },
      }),
      defineTool({
        name: 'restore_task',
        label: 'Restore task from trash',
        description: 'Restore a soft-deleted task from the trash back to its previous place.',
        parameters: Type.Object({ id: Type.String() }),
        execute: async (_id, params) => {
          await this.tasks.restore(userId, params.id);
          return textResult({ id: params.id, restored: true });
        },
      }),
      defineTool({
        name: 'restore_project',
        label: 'Restore project from trash',
        description: 'Restore a soft-deleted project from the trash.',
        parameters: Type.Object({ id: Type.String() }),
        execute: async (_id, params) => {
          await this.projects.restore(userId, params.id);
          return textResult({ id: params.id, restored: true });
        },
      }),

      // -------------------------------------------------------------- reorder
      defineTool({
        name: 'reorder_tasks',
        label: 'Reorder tasks',
        description:
          'Set the manual sort order of tasks by passing their ids in the desired order (first id becomes the topmost task). Only changes ordering; titles, dates and assignments stay untouched. Fetch ids first with list_tasks.',
        parameters: Type.Object({
          orderedIds: Type.Array(Type.String(), { description: 'Task ids in the new order' }),
        }),
        execute: async (_id, params) => {
          await this.tasks.reorder(userId, params.orderedIds);
          return textResult({ reordered: params.orderedIds.length });
        },
      }),
      defineTool({
        name: 'reorder_projects',
        label: 'Reorder projects',
        description:
          'Set the manual sort order of projects by passing their ids in the desired order (first id becomes the topmost project). Fetch ids first with list_projects.',
        parameters: Type.Object({
          orderedIds: Type.Array(Type.String(), { description: 'Project ids in the new order' }),
        }),
        execute: async (_id, params) => {
          await this.projects.reorder(userId, params.orderedIds);
          return textResult({ reordered: params.orderedIds.length });
        },
      }),
      defineTool({
        name: 'reorder_areas',
        label: 'Reorder areas',
        description:
          'Set the manual sort order of areas by passing their ids in the desired order (first id becomes the topmost area). Fetch ids first with list_areas.',
        parameters: Type.Object({
          orderedIds: Type.Array(Type.String(), { description: 'Area ids in the new order' }),
        }),
        execute: async (_id, params) => {
          await this.areas.reorder(userId, params.orderedIds);
          return textResult({ reordered: params.orderedIds.length });
        },
      }),
      defineTool({
        name: 'reorder_subtasks',
        label: 'Reorder subtasks',
        description:
          'Set the order of all subtasks of one task by passing the subtask ids in the desired order. Fetch ids first with get_task.',
        parameters: Type.Object({
          taskId: Type.String(),
          orderedIds: Type.Array(Type.String(), { description: 'Subtask ids in the new order' }),
        }),
        execute: async (_id, params) => {
          await this.subtasks.reorder(userId, params.taskId, params.orderedIds);
          return textResult({ taskId: params.taskId, reordered: params.orderedIds.length });
        },
      }),
      defineTool({
        name: 'reorder_project_layout',
        label: 'Reorder project layout',
        description:
          'Reorder a project: sets the order of its headings and which tasks sit under which heading. The payload must cover the project EXACTLY: every active heading appears once as a group (group order = heading order) and every visible task (active, not trashed) appears exactly once either in a group or in ungroupedTaskIds. Fetch the current ids with get_project first; the call fails if any id is missing, unknown or duplicated. Nothing is deleted and the order can be changed again at any time.',
        parameters: Type.Object({
          projectId: Type.String(),
          ungroupedTaskIds: Type.Array(Type.String(), {
            description: 'Visible task ids placed directly under the project, in order',
          }),
          groups: Type.Array(
            Type.Object({
              headingId: Type.String(),
              taskIds: Type.Array(Type.String(), {
                description: 'Visible task ids under this heading, in order',
              }),
            }),
            { description: 'Headings in the new order, each with its ordered tasks' },
          ),
        }),
        execute: async (_id, params) => {
          await this.projectHeadings.reorder(userId, {
            projectId: params.projectId,
            ungroupedTaskIds: params.ungroupedTaskIds,
            groups: params.groups,
          });
          return textResult({
            projectId: params.projectId,
            headings: params.groups.length,
            ungroupedTasks: params.ungroupedTaskIds.length,
            groupedTasks: params.groups.reduce((sum, group) => sum + group.taskIds.length, 0),
          });
        },
      }),

      // ---------------------------------------------------------- dangerous
      // Only irreversible operations land here; everything above is either
      // read-only or reversible (soft delete / re-editable structure /
      // reorder).
      defineTool({
        name: 'delete_task',
        label: 'Delete task (to trash)',
        description:
          'Soft-delete a task: it moves to the trash and stays restorable (see restore_task).',
        parameters: Type.Object({ id: Type.String() }),
        execute: async (_id, params) => {
          const result = await this.tasks.remove(userId, params.id);
          return textResult({ id: result.id, trashedAt: result.trashedAt });
        },
      }),
      defineTool({
        name: 'delete_project',
        label: 'Delete project (to trash)',
        description:
          'Soft-delete a project: it and its tasks move to the trash and stay restorable (see restore_project).',
        parameters: Type.Object({ id: Type.String() }),
        execute: async (_id, params) => {
          const result = await this.projects.remove(userId, params.id);
          return textResult({ id: result.id, trashedAt: result.trashedAt });
        },
      }),
      defineTool({
        name: 'empty_trash',
        label: 'Empty trash',
        description:
          'Permanently delete all trashed tasks and projects. This cannot be undone. Destructive: needs user approval.',
        destructive: true,
        parameters: Type.Object({}),
        execute: async () => {
          const result = await this.feed.emptyTrash(userId);
          return textResult(result);
        },
      }),
      defineTool({
        name: 'create_area',
        label: 'Create area',
        description:
          'Create a new top-level area. Areas organize projects and tasks. Reversible: the area can be renamed or deleted later.',
        parameters: Type.Object({
          title: Type.String(),
          notes: Type.Optional(Type.String()),
        }),
        execute: async (_id, params) => {
          const area = await this.areas.create(userId, {
            title: params.title,
            notes: params.notes,
          });
          return textResult(compact({ id: area.id, title: area.title }));
        },
      }),
      defineTool({
        name: 'update_area',
        label: 'Update area',
        description: 'Rename an area or change its notes. Reversible: edit again later.',
        parameters: Type.Object({
          id: Type.String(),
          title: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
        execute: async (_id, params) => {
          const area = await this.areas.update(userId, params.id, {
            title: params.title,
            notes: params.notes,
          });
          return textResult(compact({ id: area.id, title: area.title }));
        },
      }),
      defineTool({
        name: 'delete_area',
        label: 'Delete area',
        description:
          'Permanently delete an area (hard delete, cannot be undone). Projects and tasks lose their area assignment but are kept. Destructive: needs user approval.',
        destructive: true,
        parameters: Type.Object({ id: Type.String() }),
        execute: async (_id, params) => {
          await this.areas.remove(userId, params.id);
          return textResult({ id: params.id, deleted: true });
        },
      }),
      defineTool({
        name: 'create_project',
        label: 'Create project',
        description:
          'Create a new project, optionally inside an area. Reversible: the project can be edited or deleted later.',
        parameters: Type.Object({
          title: Type.String(),
          notes: Type.Optional(Type.String()),
          areaId: Type.Optional(Type.String()),
          scheduledType: Type.Optional(scheduledTypeSchema),
          scheduledDate: Type.Optional(Type.String()),
          dueDate: Type.Optional(Type.String()),
        }),
        execute: async (_id, params) => {
          const project = await this.projects.create(userId, {
            title: params.title,
            notes: params.notes,
            areaId: params.areaId,
            scheduledType: params.scheduledType as ScheduledType | undefined,
            scheduledDate: params.scheduledDate,
            dueDate: params.dueDate,
          });
          return textResult(
            compact({ id: project.id, title: project.title, bucket: project.bucket }),
          );
        },
      }),
      defineTool({
        name: 'update_project',
        label: 'Update project',
        description:
          'Rename a project, edit notes, change dates or move it to another area (null clears). Reversible: edit again later.',
        parameters: Type.Object({
          id: Type.String(),
          title: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
          areaId: Type.Optional(
            Type.Union([Type.String({ description: 'Target area id' }), Type.Null()]),
          ),
          scheduledType: Type.Optional(scheduledTypeSchema),
          scheduledDate: Type.Optional(
            Type.Union([Type.String({ description: 'ISO date' }), Type.Null()]),
          ),
          dueDate: Type.Optional(
            Type.Union([Type.String({ description: 'ISO date' }), Type.Null()]),
          ),
          bucket: Type.Optional(
            Type.Union([Type.Literal('INBOX'), Type.Literal('ANYTIME'), Type.Literal('SCHEDULED')]),
          ),
        }),
        execute: async (_id, params) => {
          const project = await this.projects.update(userId, params.id, {
            title: params.title,
            notes: params.notes,
            areaId: params.areaId,
            scheduledType: params.scheduledType as ScheduledType | undefined,
            scheduledDate: params.scheduledDate,
            dueDate: params.dueDate,
            bucket: params.bucket as ProjectBucket | undefined,
          });
          return textResult(compact({ id: project.id, title: project.title }));
        },
      }),
      defineTool({
        name: 'complete_project',
        label: 'Complete project',
        description: 'Mark a project as completed, or reopen it with completed=false.',
        parameters: Type.Object({
          id: Type.String(),
          completed: Type.Optional(Type.Boolean()),
        }),
        execute: async (_id, params) => {
          const project =
            params.completed === false
              ? await this.projects.uncomplete(userId, params.id)
              : await this.projects.complete(userId, params.id);
          return textResult(compact({ id: project.id, status: project.status }));
        },
      }),
      defineTool({
        name: 'create_project_heading',
        label: 'Create project heading',
        description:
          'Create a static grouping heading inside a project to organize its tasks. Reversible: the heading can be renamed or deleted later.',
        parameters: Type.Object({
          projectId: Type.String(),
          title: Type.String(),
        }),
        execute: async (_id, params) => {
          const heading = await this.projectHeadings.create(userId, {
            projectId: params.projectId,
            title: params.title,
          });
          return textResult(compact({ id: heading.id, title: heading.title }));
        },
      }),
      defineTool({
        name: 'update_project_heading',
        label: 'Update project heading',
        description: 'Rename a project heading. Reversible: edit again later.',
        parameters: Type.Object({
          id: Type.String(),
          title: Type.String(),
        }),
        execute: async (_id, params) => {
          const heading = await this.projectHeadings.update(userId, params.id, {
            title: params.title,
          });
          return textResult(
            compact({ id: heading?.id ?? params.id, title: heading?.title ?? params.title }),
          );
        },
      }),
      defineTool({
        name: 'delete_project_heading',
        label: 'Delete project heading',
        description:
          'Permanently delete a heading (hard delete, cannot be undone). Its tasks are soft-deleted to the trash and stay restorable. Destructive: needs user approval.',
        destructive: true,
        parameters: Type.Object({ id: Type.String() }),
        execute: async (_id, params) => {
          await this.projectHeadings.remove(userId, params.id);
          return textResult({ id: params.id, deleted: true });
        },
      }),
    ];
  }
}
