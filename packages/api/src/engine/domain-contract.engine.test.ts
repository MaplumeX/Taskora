/**
 * 领域规则契约（local-first-v3 issue 04）：设备的 Engine 后端对契约夹具
 * 给出与 domain 纯函数、hub REST 服务相同的 feed / 任务列表 / 搜索结果。
 * 夹具与期望见 @taskora/engine/testing。
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { SEARCH_CONTRACT, VIEW_CONTRACT } from '@taskora/engine/testing';
import type { FeedView } from '@taskora/shared';

import { usePreferencesStore } from '@/stores/preferences.store';
import type { TaskQuery } from '../api/task-backend';
import { createEngineTaskBackend } from './task-backend.engine';

const initial = usePreferencesStore.getState();

describe('领域规则契约 — 设备 Engine 后端', () => {
  let engine: Engine;
  let backend: ReturnType<typeof createEngineTaskBackend>;

  beforeAll(async () => {
    engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'contract-device',
    });
    for (const tag of VIEW_CONTRACT.tags) await engine.create('tag', { ...tag });
    for (const project of VIEW_CONTRACT.projects) await engine.create('project', { ...project });
    for (const task of VIEW_CONTRACT.tasks) await engine.create('task', { ...task });
    backend = createEngineTaskBackend({ engine });
  });

  function atContractTime() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(VIEW_CONTRACT.now));
    usePreferencesStore.setState({
      timeZone: VIEW_CONTRACT.zones.timeZone,
      legacyDateTimeZone: VIEW_CONTRACT.zones.legacyDateTimeZone,
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    usePreferencesStore.setState({
      timeZone: initial.timeZone,
      legacyDateTimeZone: initial.legacyDateTimeZone,
    });
  });

  it.each(Object.entries(VIEW_CONTRACT.feeds))('feed %s', async (view, expected) => {
    atContractTime();
    const items = await backend.getFeed(view as FeedView);
    expect(items.map((item) => item.id)).toEqual(expected);
    for (const item of items) {
      if (item.type !== 'project') continue;
      expect({ total: item.taskTotalCount, completed: item.taskCompletedCount }).toEqual(
        VIEW_CONTRACT.projectCounts[item.id],
      );
    }
  });

  it.each(VIEW_CONTRACT.queries)('tasks $query', async ({ query, ids }) => {
    atContractTime();
    const tasks = await backend.getTasks(query as TaskQuery);
    expect(tasks.map((task) => task.id)).toEqual(ids);
  });
});

describe('任务搜索契约 — 设备 Engine 后端', () => {
  let backend: ReturnType<typeof createEngineTaskBackend>;

  beforeAll(async () => {
    const engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'search-contract-device',
    });
    for (const task of SEARCH_CONTRACT.tasks) await engine.create('task', { ...task });
    for (const subtask of SEARCH_CONTRACT.subtasks) await engine.create('subtask', { ...subtask });
    backend = createEngineTaskBackend({ engine });
  });

  it.each(SEARCH_CONTRACT.cases)('q=$q extended=$extended', async ({ q, extended, hits }) => {
    const result = await backend.searchTasks(q, { extended });
    expect(
      result.map((hit) => ({ id: hit.task.id, subtasks: hit.matchedSubtasks.map((s) => s.id) })),
    ).toEqual(hits);
  });

  it('返回完整的任务 DTO 与命中的 Subtask 标题', async () => {
    const [hit] = await backend.searchTasks('eggs');
    expect(hit.task).toMatchObject({ id: 's-subtask', title: 'Weekend', status: 'ACTIVE' });
    expect(hit.matchedSubtasks).toEqual([{ id: 'sub-eggs', title: 'eggs' }]);
    expect(hit.rank).toBe('other');
  });
});
