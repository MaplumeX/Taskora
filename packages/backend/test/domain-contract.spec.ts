/**
 * 领域规则契约（local-first-v3 issue 04）：hub 的 REST 服务对契约夹具
 * 给出与 domain 纯函数、设备 Engine 后端相同的 feed / 任务列表结果。
 * 夹具与期望见 @taskora/engine/testing。
 *
 * Prisma mock 忽略 where（SQL 只是粗筛），返回夹具的存储形态：结果完全
 * 由服务里调用的 domain 规则决定。SQL 粗筛本身由数据库 e2e 覆盖。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VIEW_CONTRACT } from '@taskora/engine/testing';
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
  sortOrder: 0,
  tagGroupId: null,
  createdAt: new Date(VIEW_CONTRACT.now),
  updatedAt: new Date(VIEW_CONTRACT.now),
}));

const taskRows = VIEW_CONTRACT.tasks.map(({ tagIds, ...task }) => ({
  ...task,
  scheduledDate: date(task.scheduledDate),
  dueDate: null,
  settledAt: instant(task.settledAt),
  trashedAt: instant(task.trashedAt),
  createdAt: new Date(task.createdAt),
  updatedAt: new Date(task.createdAt),
  reminderTime: null,
  repeatRule: null,
  headingId: null,
  sortOrder: 0,
  tags: tagIds.map((tagId) => ({ tagId, tag: tagRows.find((tag) => tag.id === tagId)! })),
}));

const projectRows = VIEW_CONTRACT.projects.map((project) => ({
  ...project,
  notes: null,
  scheduledDate: date(project.scheduledDate),
  dueDate: null,
  completedAt: instant(project.completedAt),
  trashedAt: instant(project.trashedAt),
  createdAt: new Date(project.createdAt),
  updatedAt: new Date(project.createdAt),
  areaId: null,
  sortOrder: 0,
  tags: [],
}));

describe('领域规则契约 — hub REST 服务', () => {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ preferences: VIEW_CONTRACT.zones }) },
    task: { findMany: vi.fn().mockResolvedValue(taskRows) },
    project: { findMany: vi.fn().mockResolvedValue(projectRows) },
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
