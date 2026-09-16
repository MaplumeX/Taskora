import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentToolsService } from '../../src/agent/tools/agent-tools';

/**
 * Unit tests for the agent tool layer. Services are mocked: we verify the
 * wiring (right service method, right args, userId scoping, destructive flags)
 * rather than business logic that services already cover elsewhere.
 */

function createService() {
  return {
    tasks: {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ id: 't1', title: 'Task', tags: [], subtasks: [] }),
      create: vi.fn().mockResolvedValue({ id: 't2', title: 'New', bucket: 'INBOX' }),
      update: vi.fn().mockResolvedValue({ id: 't1', title: 'Renamed', bucket: 'ANYTIME' }),
      complete: vi.fn().mockResolvedValue({ id: 't1' }),
      uncomplete: vi.fn().mockResolvedValue({ id: 't1' }),
      remove: vi.fn().mockResolvedValue({ id: 't1', trashedAt: new Date() }),
      restore: vi.fn().mockResolvedValue({ id: 't1' }),
    },
    projects: {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ id: 'p1', title: 'Project' }),
      create: vi.fn().mockResolvedValue({ id: 'p2', title: 'New project', bucket: 'INBOX' }),
      update: vi.fn().mockResolvedValue({ id: 'p1', title: 'Renamed' }),
      complete: vi.fn().mockResolvedValue({ id: 'p1', status: 'COMPLETED' }),
      uncomplete: vi.fn().mockResolvedValue({ id: 'p1', status: 'ACTIVE' }),
      remove: vi.fn().mockResolvedValue({ id: 'p1', trashedAt: new Date() }),
      restore: vi.fn().mockResolvedValue({ id: 'p1' }),
    },
    areas: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'a1', title: 'Area' }),
      update: vi.fn().mockResolvedValue({ id: 'a1', title: 'Renamed' }),
      remove: vi.fn().mockResolvedValue({}),
    },
    tags: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'g1', title: 'tag', color: '#fff' }),
    },
    tagGroups: { findAll: vi.fn().mockResolvedValue([]) },
    subtasks: {
      create: vi.fn().mockResolvedValue({ id: 's1', title: 'Step', taskId: 't1' }),
      update: vi.fn().mockResolvedValue({ id: 's1', title: 'Step', status: 'COMPLETED' }),
    },
    projectHeadings: {
      findAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'h1', title: 'Heading' }),
      update: vi.fn().mockResolvedValue({ id: 'h1', title: 'Renamed' }),
      remove: vi.fn().mockResolvedValue({}),
    },
    feed: {
      findAll: vi.fn().mockResolvedValue([]),
      emptyTrash: vi.fn().mockResolvedValue({ deletedTasks: 2, deletedProjects: 1 }),
    },
  };
}

function build(service: ReturnType<typeof createService>, userId = 'user-1') {
  return new AgentToolsService(
    service.tasks as never,
    service.projects as never,
    service.areas as never,
    service.tags as never,
    service.tagGroups as never,
    service.subtasks as never,
    service.projectHeadings as never,
    service.feed as never,
  ).build(userId);
}

describe('AgentToolsService', () => {
  let service: ReturnType<typeof createService>;
  let tools: ReturnType<typeof build>;
  let otherTools: ReturnType<typeof build>;

  beforeEach(() => {
    service = createService();
    tools = build(service, 'user-1');
    otherTools = build(service, 'user-2');
  });

  const tool = (name: string) => {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`tool ${name} not found`);
    return found;
  };

  it('exposes a representative set of read and write tools', () => {
    const names = tools.map((t) => t.name);
    for (const expected of [
      'list_areas',
      'list_projects',
      'list_tasks',
      'get_task',
      'list_tags',
      'list_feed',
      'search',
      'create_task',
      'update_task',
      'create_subtask',
      'create_tag',
      'restore_task',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('marks destructive tools', () => {
    for (const name of [
      'delete_task',
      'delete_project',
      'empty_trash',
      'create_area',
      'update_area',
      'delete_area',
      'create_project',
      'update_project',
      'create_project_heading',
      'update_project_heading',
      'delete_project_heading',
    ]) {
      expect(tool(name).destructive, `${name} should be destructive`).toBe(true);
    }
    // Plain writes must NOT be destructive.
    for (const name of ['create_task', 'update_task', 'create_tag', 'restore_task']) {
      expect(tool(name).destructive, `${name} should not be destructive`).toBeFalsy();
    }
  });

  it('scopes every service call to the bound userId', async () => {
    await tool('list_tasks').execute('call-1', {} as never);
    expect(service.tasks.findAll).toHaveBeenCalledWith('user-1', expect.anything());

    await otherTools.find((t) => t.name === 'list_tasks')!.execute('call-2', {} as never);
    expect(service.tasks.findAll).toHaveBeenLastCalledWith('user-2', expect.anything());
  });

  it('create_task forwards parameters and returns compact text', async () => {
    const result = await tool('create_task').execute('call-1', {
      title: 'Buy milk',
      projectId: 'p1',
      scheduledType: 'DATE',
      scheduledDate: '2026-09-16',
    } as never);
    expect(service.tasks.create).toHaveBeenCalledWith('user-1', {
      title: 'Buy milk',
      notes: undefined,
      scheduledType: 'DATE',
      scheduledDate: '2026-09-16',
      dueDate: undefined,
      projectId: 'p1',
      areaId: undefined,
      tagIds: undefined,
    });
    const text = result.content[0];
    expect(text.type).toBe('text');
    expect(JSON.parse((text as { type: 'text'; text: string }).text).id).toBe('t2');
  });

  it('update_task with completed=true completes before updating', async () => {
    await tool('update_task').execute('call-1', {
      id: 't1',
      completed: true,
      title: 'Renamed',
    } as never);
    expect(service.tasks.complete).toHaveBeenCalledWith('user-1', 't1');
    expect(service.tasks.update).toHaveBeenCalledWith(
      'user-1',
      't1',
      expect.objectContaining({ title: 'Renamed' }),
    );
  });

  it('update_task can clear dates and project with null', async () => {
    await tool('update_task').execute('call-1', {
      id: 't1',
      dueDate: null,
      projectId: null,
    } as never);
    expect(service.tasks.update).toHaveBeenCalledWith(
      'user-1',
      't1',
      expect.objectContaining({ dueDate: null, projectId: null }),
    );
  });

  it('empty_trash calls the feed service', async () => {
    const result = await tool('empty_trash').execute('call-1', {} as never);
    expect(service.feed.emptyTrash).toHaveBeenCalledWith('user-1');
    expect((result.content[0] as { text: string }).text).toContain('deletedTasks');
  });

  it('list_feed restricts the view parameter to known literals', () => {
    const schema = tool('list_feed').parameters as unknown as {
      properties: { view: { anyOf?: unknown } };
    };
    expect(schema.properties.view.anyOf).toBeTruthy();
  });

  it('errors propagate as thrown exceptions, not error text', async () => {
    service.tasks.findOne = vi.fn().mockRejectedValue(new Error('Task not found'));
    await expect(tool('get_task').execute('call-1', { id: 'nope' } as never)).rejects.toThrow(
      'Task not found',
    );
  });

  it('every tool has an LLM-friendly name, label and description', () => {
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
    }
  });
});
