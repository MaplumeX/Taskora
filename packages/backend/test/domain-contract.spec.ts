/**
 * 领域规则契约（local-first-v3 issue 04）：hub 的 REST 服务对契约夹具
 * 给出与 domain 纯函数、设备 Engine 后端相同的 feed / 任务列表 / 搜索结果。
 * 夹具与期望见 @taskora/engine/testing。
 *
 * Prisma mock 忽略 where（SQL 只是粗筛），返回夹具的存储形态：结果完全
 * 由服务里调用的 domain 规则决定。SQL 粗筛本身由数据库 e2e 覆盖。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_CONTRACT, VIEW_CONTRACT } from '@taskora/engine/testing';
import type { FeedView } from '@taskora/shared';

import { FeedService } from '../src/feed/feed.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SyncHubService } from '../src/sync/sync-hub.service';
import { TasksService } from '../src/tasks/tasks.service';
import type { TaskQueryDto } from '../src/tasks/dto/tasks.dto';

const date = (key: string | null) => (key ? new Date(`${key}T00:00:00.000Z`) : null);
const instant = (iso: string | null) => (iso ? new Date(iso) : null);

const tagRows = VIEW_CONTRACT.tags.map((tag) => ({
  ...tag,
  color: '#3B82F6',
  createdAt: new Date(VIEW_CONTRACT.now),
  updatedAt: new Date(VIEW_CONTRACT.now),
}));

const taskRows = VIEW_CONTRACT.tasks.map(({ tagIds, ...task }) => ({
  ...task,
  scheduledDate: date(task.scheduledDate),
  dueDate: date(task.dueDate),
  settledAt: instant(task.settledAt),
  trashedAt: instant(task.trashedAt),
  createdAt: new Date(task.createdAt),
  updatedAt: new Date(task.createdAt),
  reminderTime: null,
  repeatRule: null,
  headingId: null,
  tags: tagIds.map((tagId) => ({ tagId, tag: tagRows.find((tag) => tag.id === tagId)! })),
}));

const tagLinks = (tagIds: string[]) =>
  tagIds.map((tagId) => ({ tagId, tag: tagRows.find((tag) => tag.id === tagId)! }));

const areaRows = VIEW_CONTRACT.areas.map(({ tagIds, ...area }) => ({
  ...area,
  tags: tagLinks(tagIds),
}));

const projectRows = VIEW_CONTRACT.projects.map(({ tagIds, ...project }) => ({
  ...project,
  notes: null,
  scheduledDate: date(project.scheduledDate),
  dueDate: date(project.dueDate),
  completedAt: instant(project.completedAt),
  trashedAt: instant(project.trashedAt),
  createdAt: new Date(project.createdAt),
  updatedAt: new Date(project.createdAt),
  tags: tagLinks(tagIds),
}));

describe('领域规则契约 — hub REST 服务', () => {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ preferences: VIEW_CONTRACT.zones }) },
    task: { findMany: vi.fn().mockResolvedValue(taskRows) },
    project: { findMany: vi.fn().mockResolvedValue(projectRows) },
    area: { findMany: vi.fn().mockResolvedValue(areaRows) },
    tag: { findMany: vi.fn().mockResolvedValue(tagRows) },
  } as unknown as PrismaService;
  const feed = new FeedService(prisma, {} as SyncHubService);
  const tasks = new TasksService(prisma, {} as SyncHubService);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(VIEW_CONTRACT.now));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(Object.entries(VIEW_CONTRACT.feeds))('feed %s', async (view, expected) => {
    const items = await feed.findAll('user-1', view as FeedView);
    expect(items.map((item) => item.id)).toEqual(expected);
    for (const item of items) {
      if (item.type !== 'project') continue;
      expect({ total: item.taskTotalCount, completed: item.taskCompletedCount }).toEqual(
        VIEW_CONTRACT.projectCounts[item.id],
      );
    }
  });

  it.each(VIEW_CONTRACT.queries)('tasks $query', async ({ query, ids }) => {
    const result = await tasks.findAll('user-1', query as TaskQueryDto);
    expect(result.map((task) => task.id)).toEqual(ids);
  });
});

describe('任务搜索契约 — hub REST 服务', () => {
  const subtaskRows = SEARCH_CONTRACT.subtasks.map((subtask) => ({
    ...subtask,
    settledAt: instant(subtask.settledAt),
    createdAt: new Date(subtask.createdAt),
  }));
  // Prisma mock 忽略 where / include 的过滤：每个任务带上它全部的 Subtask
  const searchRows = SEARCH_CONTRACT.tasks.map(({ tagIds, ...task }) => ({
    ...task,
    scheduledDate: date(task.scheduledDate),
    dueDate: date(task.dueDate),
    settledAt: instant(task.settledAt),
    trashedAt: instant(task.trashedAt),
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.createdAt),
    reminderTime: null,
    repeatRule: null,
    headingId: null,
    tags: tagIds.map((tagId) => ({
      tagId,
      tag: { ...SEARCH_CONTRACT.tags.find((tag) => tag.id === tagId)!, color: '#3B82F6' },
    })),
    subtasks: subtaskRows.filter((subtask) => subtask.taskId === task.id),
  }));
  const prisma = {
    task: { findMany: vi.fn().mockResolvedValue(searchRows) },
    project: { findMany: vi.fn().mockResolvedValue([]) },
    area: {
      findMany: vi.fn().mockResolvedValue(
        SEARCH_CONTRACT.areas.map(({ tagIds, ...area }) => ({
          ...area,
          tags: tagIds.map((tagId) => ({ tagId })),
        })),
      ),
    },
    tag: { findMany: vi.fn().mockResolvedValue(SEARCH_CONTRACT.tags) },
  } as unknown as PrismaService;
  const tasks = new TasksService(prisma, {} as SyncHubService);

  it.each(SEARCH_CONTRACT.cases)('q=$q extended=$extended tagIds=$tagIds', async (contract) => {
    const { q, extended, tagIds, hits } = contract;
    const result = await tasks.search('user-1', q, { extended, tagIds });
    expect(
      result.map((hit) => ({ id: hit.task.id, subtasks: hit.matchedSubtasks.map((s) => s.id) })),
    ).toEqual(hits);
  });
});
