/**
 * Engine 实现的 Project Heading 传输层 — 桌面端完全体（V2 spec）。
 *
 * Heading 增删改/归档/布局重排全部本地。语义与 ProjectHeadingsService
 * 对齐：删除 = 软删 heading 下 direct tasks + 物理删 heading；归档 =
 * 完成其下 ACTIVE tasks + heading 终态；布局重排的 id 集校验同 REST。
 */

import type { Engine } from '@taskora/engine';
import { positionAfter, positionsBetween } from '@taskora/engine';
import {
  HeadingStatus,
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskStatus,
} from '@taskora/shared';
import type { ProjectHeadingResponseDto } from '@taskora/shared';

import type { ProjectHeadingBackend } from '../api/project-heading-backend';
import { projectHeadingRowToDto, projectRowToDto, tagRowToDto } from './mappers';

export interface EngineProjectHeadingBackendOptions {
  engine: Engine;
}

export function createEngineProjectHeadingBackend(
  options: EngineProjectHeadingBackendOptions,
): ProjectHeadingBackend {
  const { engine } = options;

  async function headingDto(id: string): Promise<ProjectHeadingResponseDto> {
    const row = await engine.get('project-heading', id);
    if (!row) throw new Error(`Heading not found: ${id}`);
    return projectHeadingRowToDto(row);
  }

  /** 归属校验（不过滤 trashedAt，与 assertProjectOwnership 对齐）。 */
  async function assertProject(projectId: string): Promise<void> {
    const project = await engine.get('project', projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
  }

  /** heading 下的直接 tasks（含 trashed；REST 同口径）。 */
  async function tasksUnderHeading(headingId: string) {
    const tasks = await engine.list('task');
    return tasks.filter((row) => row.fields.headingId === headingId);
  }

  return {
    async getProjectHeadings(projectId, options) {
      await assertProject(projectId);
      const headings = (await engine.list('project-heading')).filter(
        (row) =>
          row.fields.projectId === projectId &&
          (options?.includeArchived || row.fields.status === HeadingStatus.ACTIVE),
      );
      // tiebreak 对齐 REST（ProjectHeadingsService：sortOrder asc, createdAt
      // asc）；副本 list 的 createdAt 是 desc（通用 tiebreak）
      return [...headings]
        .sort((a, b) => {
          const sa = (a.fields.sortOrder as number) ?? 0;
          const sb = (b.fields.sortOrder as number) ?? 0;
          if (sa !== sb) return sa - sb;
          return String(a.fields.createdAt ?? '').localeCompare(String(b.fields.createdAt ?? ''));
        })
        .map((row) => projectHeadingRowToDto(row));
    },

    async createProjectHeading(data) {
      await assertProject(data.projectId);
      const siblings = (await engine.list('project-heading')).filter(
        (row) => row.fields.projectId === data.projectId,
      );
      const sortOrder =
        siblings.reduce((max, h) => Math.max(max, (h.fields.sortOrder as number) ?? 0), -1) + 1;
      const id = await engine.create('project-heading', {
        projectId: data.projectId,
        title: data.title,
        sortOrder,
        status: HeadingStatus.ACTIVE,
        completedAt: null,
      });
      return headingDto(id);
    },

    async updateProjectHeading(id, data) {
      const existing = await engine.get('project-heading', id);
      if (!existing) throw new Error(`Heading not found: ${id}`);
      const patch: Record<string, unknown> = {};
      if (data.title !== undefined) patch.title = data.title;
      await engine.update('project-heading', id, patch);
      return headingDto(id);
    },

    async deleteProjectHeading(id) {
      const existing = await engine.get('project-heading', id);
      if (!existing) throw new Error(`Heading not found: ${id}`);
      // 与 REST 同语义：软删 heading 下直接 tasks（Subtask 随父 Task
      // 生命周期），物理删除 heading（Delete Request，ADR-0008）。
      const now = new Date().toISOString();
      const tasks = await tasksUnderHeading(id);
      await Promise.all(tasks.map((row) => engine.update('task', row.id, { trashedAt: now })));
      await engine.delete('project-heading', [id]);
    },

    async convertProjectHeadingToProject(id) {
      // 与 REST 同语义：新 Project 继承源 Project 的 areaId；heading 下
      // tasks 移入新 Project（仅 projectId/headingId 变化）；heading 消失。
      const heading = await engine.get('project-heading', id);
      if (!heading) throw new Error(`Heading not found: ${id}`);
      const source = await engine.get('project', heading.fields.projectId as string);
      if (!source) throw new Error(`Project not found: ${heading.fields.projectId}`);

      const projects = await engine.list('project');
      const sortOrder =
        projects.reduce((max, p) => Math.max(max, (p.fields.sortOrder as number) ?? 0), -1) + 1;
      const projectId = await engine.create('project', {
        title: (heading.fields.title as string) ?? '',
        notes: null,
        status: ProjectStatus.ACTIVE,
        bucket: ProjectBucket.ANYTIME,
        scheduledType: ScheduledType.NONE,
        areaId: (source.fields.areaId as string | null) ?? null,
        position: positionAfter(
          projects,
          projects.length > 0 ? projects[projects.length - 1].id : null,
        ),
        sortOrder,
        tagIds: [],
      });

      const tasks = await tasksUnderHeading(id);
      await Promise.all(
        tasks.map((row) => engine.update('task', row.id, { projectId, headingId: null })),
      );
      await engine.delete('project-heading', [id]);

      const row = await engine.get('project', projectId);
      if (!row) throw new Error(`Project not found: ${projectId}`);
      const tags = new Map((await engine.list('tag')).map((t) => [t.id, tagRowToDto(t)]));
      return projectRowToDto(row, tags, 0, 0);
    },

    async reorderProjectHeadingLayout(data) {
      await assertProject(data.projectId);
      const headings = (await engine.list('project-heading')).filter(
        (row) =>
          row.fields.projectId === data.projectId && row.fields.status === HeadingStatus.ACTIVE,
      );
      const visibleTasks = (await engine.list('task')).filter(
        (row) =>
          row.fields.projectId === data.projectId &&
          row.fields.trashedAt == null &&
          row.fields.status === TaskStatus.ACTIVE,
      );

      // id 集校验与 REST 同规则（重复/缺失/越权 → 报错要求刷新重试）
      const headingIds = data.groups.map((group) => group.headingId);
      assertExactIdSet(
        headingIds,
        headings.map((row) => row.id),
        'heading',
      );
      const submittedTaskIds = [
        ...data.ungroupedTaskIds,
        ...data.groups.flatMap((group) => group.taskIds),
      ];
      assertExactIdSet(
        submittedTaskIds,
        visibleTasks.map((row) => row.id),
        'task',
      );

      // 双排序键一起写（对齐 reorderProjects 惯例）：sortOrder 维持 REST
      // 列惯例（分组内索引）；position 按整页视觉顺序（ungrouped 在前、
      // 各 heading 分组依次）分配全局等距键——本地副本按 position 读，
      // 漏写会让桌面端拖拽后弹回旧顺序。
      const visualTaskIds = [
        ...data.ungroupedTaskIds,
        ...data.groups.flatMap((group) => group.taskIds),
      ];
      const positionKeys = positionsBetween(null, null, visualTaskIds.length);
      const positionOf = new Map(visualTaskIds.map((id, index) => [id, positionKeys[index]]));
      const positionPatch = (taskId: string): Record<string, unknown> => {
        const position = positionOf.get(taskId);
        return position !== undefined ? { position } : {};
      };

      const writes: Array<Promise<unknown>> = [];
      for (const [groupIndex, group] of data.groups.entries()) {
        writes.push(engine.update('project-heading', group.headingId, { sortOrder: groupIndex }));
        for (const [taskIndex, taskId] of group.taskIds.entries()) {
          writes.push(
            engine.update('task', taskId, {
              headingId: group.headingId,
              sortOrder: taskIndex,
              ...positionPatch(taskId),
            }),
          );
        }
      }
      for (const [taskIndex, taskId] of data.ungroupedTaskIds.entries()) {
        writes.push(
          engine.update('task', taskId, {
            headingId: null,
            sortOrder: taskIndex,
            ...positionPatch(taskId),
          }),
        );
      }
      await Promise.all(writes);
    },

    async archiveProjectHeading(id) {
      const existing = await engine.get('project-heading', id);
      if (!existing) throw new Error(`Heading not found: ${id}`);
      // 与 REST 同语义：完成其下 ACTIVE tasks，heading 转 COMPLETED。
      const now = new Date().toISOString();
      const tasks = await tasksUnderHeading(id);
      await Promise.all(
        tasks
          .filter((row) => row.fields.status === TaskStatus.ACTIVE && row.fields.trashedAt == null)
          .map((row) =>
            engine.update('task', row.id, {
              status: TaskStatus.COMPLETED,
              settledAt: now,
            }),
          ),
      );
      await engine.update('project-heading', id, {
        status: HeadingStatus.COMPLETED,
        completedAt: now,
      });
      return headingDto(id);
    },

    async unarchiveProjectHeading(id) {
      const existing = await engine.get('project-heading', id);
      if (!existing) throw new Error(`Heading not found: ${id}`);
      await engine.update('project-heading', id, {
        status: HeadingStatus.ACTIVE,
        completedAt: null,
      });
      return headingDto(id);
    },
  };
}

function assertExactIdSet(submittedIds: string[], expectedIds: string[], kind: 'heading' | 'task') {
  const submitted = new Set(submittedIds);
  const expected = new Set(expectedIds);
  if (submitted.size !== submittedIds.length) {
    throw new Error(`Duplicate ${kind} id`);
  }
  if (submitted.size !== expected.size || [...submitted].some((id) => !expected.has(id))) {
    throw new Error(`Invalid or omitted ${kind} id`);
  }
}
