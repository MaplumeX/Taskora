/**
 * Engine 实现的 Project 传输层 — 桌面端完全体（V2 spec，ADR-0007）。
 *
 * Project 的全部读写直接作用于 Local Replica：断网全功能可用；写操作
 * 进 Outbox。领域规则（bucket、计划、完成、Trash 级联、进度计数）来自
 * @taskora/engine 的 domain 纯函数，与 REST 服务共用（local-first-v3
 * issue 04）；排序位次沿 Position（新项目追加末尾）。
 */

import { currentLegacyDateTimeZone, currentReviewContext, currentTimeZone } from '@/utils/date';
import type { CalendarZones, Engine, ReplicaRow } from '@taskora/engine';
import {
  buildReviewQueue,
  countProjectTasks,
  normalizeRepeatRule,
  planMarkReviewed,
  planProjectComplete,
  planProjectCreate,
  planProjectRepeatSkip,
  planProjectRestore,
  planProjectTrash,
  planProjectUpdate,
  planRepeatProjectInstance,
  positionAfter,
  projectReopenPatch,
  projectUpdatePutsBack,
  repeatDerivationTarget,
  RepeatSkipBlockedError,
  repositionMinimal,
} from '@taskora/engine';
import type {
  CompleteProjectDto,
  CreateProjectDto,
  ProjectResponseDto,
  ReviewQueue,
  TagResponseDto,
  UpdateProjectDto,
} from '@taskora/shared';

import type { ProjectBackend } from '../api/project-backend';
import { attachmentSources, positionedRows, projectRowToDto, tagIndexFor } from './mappers';

function zones(): CalendarZones {
  return { timeZone: currentTimeZone(), legacyDateTimeZone: currentLegacyDateTimeZone() };
}

function tagIdsOf(row: ReplicaRow): string[] {
  return Array.isArray(row.fields.tagIds) ? (row.fields.tagIds as string[]) : [];
}

export interface EngineProjectBackendOptions {
  engine: Engine;
}

export function createEngineProjectBackend(options: EngineProjectBackendOptions): ProjectBackend {
  const { engine } = options;

  const tagIndex = (): Promise<Map<string, TagResponseDto>> => tagIndexFor(engine);

  /** 一批项目的进度计数（一次查询；逐项目各扫一遍是 N 次全表扫描）。 */
  async function projectCountsFor(
    projectIds: string[],
  ): Promise<Map<string, { total: number; completed: number }>> {
    const tasks = await engine.list('task', {
      where: { projectId: { in: projectIds }, trashedAt: null },
    });
    return countProjectTasks(
      projectIds,
      tasks.map((row) => ({
        projectId: row.fields.projectId,
        status: row.fields.status,
        trashedAt: row.fields.trashedAt,
      })),
    );
  }

  async function projectCounts(projectId: string): Promise<{ total: number; completed: number }> {
    return (await projectCountsFor([projectId])).get(projectId)!;
  }

  async function projectDto(id: string): Promise<ProjectResponseDto> {
    const row = await engine.get('project', id);
    if (!row) throw new Error(`Project not found: ${id}`);
    const counts = await projectCounts(id);
    return projectRowToDto(row, await tagIndex(), counts.total, counts.completed);
  }

  /**
   * 重复项目派生（recurring-projects spec / ADR-0012）：完成的设备在本地
   * 派生下一轮项目（规则见 domain planRepeatProjectInstance），连同
   * Headings / 任务 / Subtask 副本写入 Local Replica、走 Outbox。parent 为
   * 完成前的项目行，tasks 为完成前项目下的全部任务行。
   */
  async function deriveRepeatProject(
    parent: ReplicaRow,
    tasks: readonly ReplicaRow[],
    completedAt: string,
  ): Promise<void> {
    const f = parent.fields;
    const plan = planRepeatProjectInstance(
      {
        id: parent.id,
        title: (f.title as string) ?? '',
        notes: (f.notes as string | null) ?? null,
        scheduledDate: f.scheduledDate,
        dueDate: f.dueDate,
        repeatRule: normalizeRepeatRule(f.repeatRule),
        reviewInterval: f.reviewInterval,
        areaId: (f.areaId as string | null) ?? null,
        tagIds: tagIdsOf(parent),
      },
      completedAt,
      zones(),
      currentReviewContext(),
    );
    if (!plan) return;
    const linked = await engine.list('project', {
      where: { repeatSourceId: parent.id, trashedAt: null },
      limit: 1,
    });
    const plannedRow = await engine.get('project', plan.id);
    const target = repeatDerivationTarget({
      hasLinkedInstance: linked.length > 0,
      plannedId: plannedRow
        ? plannedRow.fields.trashedAt
          ? 'trashed'
          : 'live'
        : (await engine.isCompacted('project', plan.id))
          ? 'compacted'
          : 'absent',
    });
    if (target === 'skip') return;

    // 侧边栏中紧跟来源项目
    const projects = await engine.list('project');
    const instanceId = await engine.create('project', {
      ...(target === 'planned' ? { id: plan.id } : {}),
      ...plan.project,
      position: positionAfter(projects, parent.id),
    });

    const taskIds = { in: tasks.map((row) => row.id) };
    const [headings, subtasks, attachments] = await Promise.all([
      engine.list('project-heading', { where: { projectId: parent.id } }),
      engine.list('subtask', { where: { taskId: taskIds } }),
      engine.list('attachment', { where: { taskId: taskIds } }),
    ]);
    const copy = plan.copyFor(instanceId, {
      headings: positionedRows(headings).map((heading, index) => ({
        ...heading,
        title: (headings[index].fields.title as string) ?? '',
      })),
      tasks: positionedRows(tasks).map((task, index) => {
        const t = tasks[index].fields;
        return {
          ...task,
          title: (t.title as string) ?? '',
          notes: (t.notes as string | null) ?? null,
          scheduledType: t.scheduledType,
          scheduledDate: t.scheduledDate,
          dueDate: t.dueDate,
          reminderTime: (t.reminderTime as string | null) ?? null,
          repeatRule: normalizeRepeatRule(t.repeatRule),
          repeatSourceId: (t.repeatSourceId as string | null) ?? null,
          bucket: t.bucket,
          trashedAt: t.trashedAt,
          headingId: (t.headingId as string | null) ?? null,
          areaId: (t.areaId as string | null) ?? null,
          tagIds: tagIdsOf(tasks[index]),
        };
      }),
      subtasks: positionedRows(subtasks).map((subtask, index) => ({
        ...subtask,
        title: (subtasks[index].fields.title as string) ?? '',
        taskId: (subtasks[index].fields.taskId as string) ?? '',
      })),
      attachments: attachmentSources(attachments),
    });
    for (const heading of copy.headings) await engine.create('project-heading', { ...heading });
    for (const task of copy.tasks) await engine.create('task', { ...task });
    for (const subtask of copy.subtasks) await engine.create('subtask', { ...subtask });
    for (const attachment of copy.attachments) {
      await engine.create('attachment', { ...attachment });
    }
  }

  return {
    async getProjects(): Promise<ProjectResponseDto[]> {
      const index = await tagIndex();
      const projects = await engine.list('project', { where: { trashedAt: null } });
      const counts = await projectCountsFor(projects.map((row) => row.id));
      return projects.map((row) => {
        const { total, completed } = counts.get(row.id)!;
        return projectRowToDto(row, index, total, completed);
      });
    },

    async getProject(id: string): Promise<ProjectResponseDto> {
      return projectDto(id);
    },

    async createProject(data: CreateProjectDto): Promise<ProjectResponseDto> {
      // 新项目排末尾（Position 追加）
      const existing = await engine.list('project');
      const id = await engine.create('project', {
        ...planProjectCreate(data, zones(), currentReviewContext()),
        position: positionAfter(
          existing,
          existing.length > 0 ? existing[existing.length - 1].id : null,
        ),
      });
      return projectDto(id);
    },

    async updateProject(id: string, data: UpdateProjectDto): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const f = existing.fields;
      const patch = planProjectUpdate(
        { ...f, scheduledType: f.scheduledType, scheduledDate: f.scheduledDate, bucket: f.bucket },
        data,
        zones(),
        currentReviewContext(),
      );
      // Trash 中改日期 / 区域 / 标签等即放回，级联同 restoreProject
      if (f.trashedAt != null && projectUpdatePutsBack(data)) {
        const tasks = await engine.list('task', {
          where: { projectId: id, trashedAt: { notNull: true } },
        });
        const plan = planProjectRestore(
          f.trashedAt,
          tasks.map((row) => ({ id: row.id, trashedAt: row.fields.trashedAt })),
        );
        await engine.update('project', id, { ...patch, ...plan.project });
        await engine.updateMany(
          'task',
          plan.tasks.map(({ id: taskId, patch: taskPatch }) => ({
            id: taskId,
            patch: { ...taskPatch },
          })),
        );
        return projectDto(id);
      }
      await engine.update('project', id, { ...patch });
      return projectDto(id);
    },

    async deleteProject(id: string): Promise<void> {
      const tasks = await engine.list('task', { where: { projectId: id } });
      const plan = planProjectTrash(
        new Date().toISOString(),
        tasks.map((row) => ({ id: row.id, trashedAt: row.fields.trashedAt })),
      );
      await engine.update('project', id, { ...plan.project });
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
    },

    async restoreProject(id: string): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const tasks = await engine.list('task', {
        where: { projectId: id, trashedAt: { notNull: true } },
      });
      const plan = planProjectRestore(
        existing.fields.trashedAt,
        tasks.map((row) => ({ id: row.id, trashedAt: row.fields.trashedAt })),
      );
      await engine.update('project', id, { ...plan.project });
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
      return projectDto(id);
    },

    async completeProject(id: string, options?: CompleteProjectDto): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const tasks = await engine.list('task', { where: { projectId: id } });
      const completedAt = new Date().toISOString();
      const plan = planProjectComplete(
        existing.fields.status,
        completedAt,
        tasks.map((row) => ({
          id: row.id,
          status: row.fields.status,
          trashedAt: row.fields.trashedAt,
        })),
        options?.settleRemaining,
      );
      if (!plan) return projectDto(id);
      await engine.update('project', id, { ...plan.project });
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
      if (plan.deriveRepeat) await deriveRepeatProject(existing, tasks, completedAt);
      return projectDto(id);
    },

    async skipProject(id: string): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const f = existing.fields;
      const [linked, tasks] = await Promise.all([
        engine.list('project', { where: { repeatSourceId: id, trashedAt: null }, limit: 1 }),
        engine.list('task', { where: { projectId: id } }),
      ]);
      const plan = planProjectRepeatSkip(
        {
          status: f.status,
          trashedAt: f.trashedAt,
          scheduledType: f.scheduledType,
          scheduledDate: f.scheduledDate,
          dueDate: f.dueDate,
          repeatRule: normalizeRepeatRule(f.repeatRule),
        },
        tasks.map((row) => ({
          id: row.id,
          status: row.fields.status,
          trashedAt: row.fields.trashedAt,
          scheduledType: row.fields.scheduledType,
          scheduledDate: row.fields.scheduledDate,
          dueDate: row.fields.dueDate,
        })),
        linked.length > 0,
        new Date().toISOString(),
        zones(),
      );
      if ('blocked' in plan) throw new RepeatSkipBlockedError(plan.blocked);
      await engine.update('project', id, { ...plan.project });
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
      return projectDto(id);
    },

    async uncompleteProject(id: string): Promise<ProjectResponseDto> {
      await engine.update('project', id, { ...projectReopenPatch() });
      return projectDto(id);
    },

    async reorderProjects(orderedIds: string[]): Promise<void> {
      // 只给必须移动的行分配新 Position，一个事务一次通知（同 reorderTasks）
      const rows = await engine.list('project');
      const byId = new Map(rows.map((row) => [row.id, row]));
      const changes = repositionMinimal(
        orderedIds.flatMap((id) => {
          const row = byId.get(id);
          if (!row) return [];
          const position = row.fields.position;
          return [{ id, position: typeof position === 'string' ? position : null }];
        }),
      );
      await engine.updateMany(
        'project',
        changes.map(({ id, position }) => ({ id, patch: { position } })),
      );
    },

    async markProjectReviewed(id: string): Promise<ProjectResponseDto> {
      const existing = await engine.get('project', id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      await engine.update('project', id, {
        ...planMarkReviewed(existing.fields, 'project', currentReviewContext()),
      });
      return projectDto(id);
    },

    async getReviewQueue(): Promise<ReviewQueue> {
      const [projects, areas] = await Promise.all([
        engine.list('project', { where: { trashedAt: null } }),
        engine.list('area'),
      ]);
      return buildReviewQueue(
        projects.map((row) => ({
          id: row.id,
          areaId: (row.fields.areaId as string | null) ?? null,
          position: (row.fields.position as string | null) ?? null,
          status: row.fields.status,
          trashedAt: row.fields.trashedAt,
          nextReviewDate: row.fields.nextReviewDate,
        })),
        areas.map((row) => ({
          id: row.id,
          position: (row.fields.position as string | null) ?? null,
          nextReviewDate: row.fields.nextReviewDate,
        })),
        currentReviewContext().today,
        zones(),
      );
    },
  };
}
