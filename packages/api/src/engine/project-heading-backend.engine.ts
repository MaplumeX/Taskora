/**
 * Engine 实现的 Project Heading 传输层 — 桌面端完全体（V2 spec）。
 *
 * Heading 增删改/归档/布局重排全部本地。领域规则（删除 / 归档 / 转
 * 项目 / 布局校验与目标状态、列表顺序）来自 @taskora/engine 的 domain
 * 纯函数，与 REST 服务共用（local-first-v3 issue 04）；这里只负责读写
 * 副本与位次分配。
 */

import type { Engine } from '@taskora/engine';
import {
  headingUnarchivePatch,
  isLayoutTask,
  planHeadingArchive,
  planHeadingDelete,
  planHeadingLayout,
  planHeadingToProject,
  positionAfter,
  repositionMinimal,
  sortHeadings,
} from '@taskora/engine';
import { HeadingStatus } from '@taskora/shared';
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

  /** 项目存在校验（不过滤 trashedAt：Trash 里的项目详情仍管理分组）。 */
  async function assertProject(projectId: string): Promise<void> {
    const project = await engine.get('project', projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
  }

  /** heading 下的直接 tasks（含 trashed）。 */
  async function tasksUnderHeading(headingId: string) {
    return engine.list('task', { where: { headingId } });
  }

  const taskStates = (rows: Awaited<ReturnType<typeof tasksUnderHeading>>) =>
    rows.map((row) => ({ id: row.id, status: row.fields.status, trashedAt: row.fields.trashedAt }));

  return {
    async getProjectHeadings(projectId, options) {
      await assertProject(projectId);
      const headings = (await engine.list('project-heading', { where: { projectId } })).filter(
        (row) => options?.includeArchived || row.fields.status === HeadingStatus.ACTIVE,
      );
      return sortHeadings(
        headings.map((row) => ({
          row,
          sortOrder: row.fields.sortOrder,
          createdAt: row.fields.createdAt,
        })),
      ).map(({ row }) => projectHeadingRowToDto(row));
    },

    async createProjectHeading(data) {
      await assertProject(data.projectId);
      const siblings = await engine.list('project-heading', {
        where: { projectId: data.projectId },
      });
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
      const trashes = planHeadingDelete(
        new Date().toISOString(),
        taskStates(await tasksUnderHeading(id)),
      );
      await engine.updateMany(
        'task',
        trashes.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
      // 分组本身物理删除（Delete Request，ADR-0008）
      await engine.delete('project-heading', [id]);
    },

    async convertProjectHeadingToProject(id) {
      const heading = await engine.get('project-heading', id);
      if (!heading) throw new Error(`Heading not found: ${id}`);
      const source = await engine.get('project', heading.fields.projectId as string);
      if (!source) throw new Error(`Project not found: ${heading.fields.projectId}`);
      const plan = planHeadingToProject(
        (heading.fields.title as string) ?? '',
        (source.fields.areaId as string | null) ?? null,
      );

      // 新项目排末尾（sortOrder = max + 1，Position 追加）
      const projects = await engine.list('project');
      const projectId = await engine.create('project', {
        ...plan.project,
        position: positionAfter(
          projects,
          projects.length > 0 ? projects[projects.length - 1].id : null,
        ),
        sortOrder:
          projects.reduce((max, p) => Math.max(max, (p.fields.sortOrder as number) ?? 0), -1) + 1,
      });

      const tasks = await tasksUnderHeading(id);
      await engine.updateMany(
        'task',
        tasks.map((row) => ({ id: row.id, patch: { ...plan.taskPatch(projectId) } })),
      );
      await engine.delete('project-heading', [id]);

      const row = await engine.get('project', projectId);
      if (!row) throw new Error(`Project not found: ${projectId}`);
      const tags = new Map((await engine.list('tag')).map((t) => [t.id, tagRowToDto(t)]));
      return projectRowToDto(row, tags, 0, 0);
    },

    async reorderProjectHeadingLayout(data) {
      await assertProject(data.projectId);
      const headings = await engine.list('project-heading', {
        where: { projectId: data.projectId, status: HeadingStatus.ACTIVE },
      });
      const projectTasks = (
        await engine.list('task', { where: { projectId: data.projectId, trashedAt: null } })
      ).filter((row) => isLayoutTask(row.fields as { status: unknown; trashedAt: unknown }));
      // 校验（与当前数据不符 → HeadingLayoutMismatchError，要求刷新重试）并得到目标状态
      const plan = planHeadingLayout(
        data,
        headings.map((row) => row.id),
        projectTasks.map((row) => row.id),
      );

      // 只写真正变化的字段，一个事务一次通知：heading 的 sortOrder、task
      // 的 headingId（跨组移动）与 position（按整页视觉顺序，只给必须
      // 移动的行分配新键）。
      const taskById = new Map(projectTasks.map((row) => [row.id, row]));
      const patches = new Map<string, Record<string, unknown>>();
      const patchOf = (id: string) => {
        const patch = patches.get(id) ?? {};
        patches.set(id, patch);
        return patch;
      };
      for (const { id, headingId } of plan.taskHeading) {
        if ((taskById.get(id)?.fields.headingId ?? null) !== headingId) {
          patchOf(id).headingId = headingId;
        }
      }
      const moved = repositionMinimal(
        plan.visualTaskIds.map((id) => {
          const position = taskById.get(id)?.fields.position;
          return { id, position: typeof position === 'string' ? position : null };
        }),
      );
      for (const { id, position } of moved) patchOf(id).position = position;

      const headingById = new Map(headings.map((row) => [row.id, row]));
      await engine.updateMany(
        'project-heading',
        plan.headingOrder
          .filter(({ id, sortOrder }) => headingById.get(id)?.fields.sortOrder !== sortOrder)
          .map(({ id, sortOrder }) => ({ id, patch: { sortOrder } })),
      );
      await engine.updateMany(
        'task',
        [...patches].map(([id, patch]) => ({ id, patch })),
      );
    },

    async archiveProjectHeading(id) {
      const existing = await engine.get('project-heading', id);
      if (!existing) throw new Error(`Heading not found: ${id}`);
      const plan = planHeadingArchive(
        new Date().toISOString(),
        taskStates(await tasksUnderHeading(id)),
      );
      await engine.updateMany(
        'task',
        plan.tasks.map(({ id: taskId, patch }) => ({ id: taskId, patch: { ...patch } })),
      );
      await engine.update('project-heading', id, { ...plan.heading });
      return headingDto(id);
    },

    async unarchiveProjectHeading(id) {
      const existing = await engine.get('project-heading', id);
      if (!existing) throw new Error(`Heading not found: ${id}`);
      await engine.update('project-heading', id, { ...headingUnarchivePatch() });
      return headingDto(id);
    },
  };
}
