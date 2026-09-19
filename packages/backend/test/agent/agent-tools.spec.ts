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
      cancel: vi.fn().mockResolvedValue({ id: 't1', status: 'CANCELLED' }),
      uncancel: vi.fn().mockResolvedValue({ id: 't1', status: 'ACTIVE' }),
      remove: vi.fn().mockResolvedValue({ id: 't1', trashedAt: new Date() }),
      restore: vi.fn().mockResolvedValue({ id: 't1' }),
      reorder: vi.fn().mockResolvedValue(undefined),
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
      reorder: vi.fn().mockResolvedValue(undefined),
    },
    areas: {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockRejectedValue(new Error('not found')),
      create: vi.fn().mockResolvedValue({ id: 'a1', title: 'Area' }),
      update: vi.fn().mockResolvedValue({ id: 'a1', title: 'Renamed' }),
      remove: vi.fn().mockResolvedValue({}),
      reorder: vi.fn().mockResolvedValue(undefined),
    },
    tags: {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockRejectedValue(new Error('not found')),
      create: vi.fn().mockResolvedValue({ id: 'g1', title: 'tag', color: '#fff' }),
    },
    tagGroups: { findAll: vi.fn().mockResolvedValue([]) },
    subtasks: {
      create: vi.fn().mockResolvedValue({ id: 's1', title: 'Step', taskId: 't1' }),
      update: vi.fn().mockResolvedValue({ id: 's1', title: 'Step', status: 'COMPLETED' }),
      cancel: vi.fn().mockResolvedValue({ id: 's1', title: 'Step', status: 'CANCELLED' }),
      uncancel: vi.fn().mockResolvedValue({ id: 's1', title: 'Step', status: 'ACTIVE' }),
      reorder: vi.fn().mockResolvedValue(undefined),
    },
    projectHeadings: {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockRejectedValue(new Error('not found')),
      create: vi.fn().mockResolvedValue({ id: 'h1', title: 'Heading' }),
      update: vi.fn().mockResolvedValue({ id: 'h1', title: 'Renamed' }),
      remove: vi.fn().mockResolvedValue({}),
      reorder: vi.fn().mockResolvedValue(undefined),
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
      'reorder_tasks',
      'reorder_projects',
      'reorder_areas',
      'reorder_subtasks',
      'reorder_project_layout',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('marks exactly the irreversible tools as destructive', () => {
    // Truly irreversible: permanent delete / hard delete.
    for (const name of ['empty_trash', 'delete_area', 'delete_project_heading']) {
      expect(tool(name).destructive, `${name} should be destructive`).toBe(true);
    }
    // Everything else — including restorable soft deletes (delete_task /
    // delete_project), re-editable structure changes and reorder tools
    // (reorder_project_layout requires an exact id set, so nothing can be
    // lost) — must run without an approval card so the approval signal
    // stays meaningful.
    for (const name of tools.map((t) => t.name)) {
      if (['empty_trash', 'delete_area', 'delete_project_heading'].includes(name)) continue;
      expect(tool(name).destructive, `${name} should not be destructive`).toBeFalsy();
    }
  });

  it('resolves entity ids in tool args to titles for the approval card', async () => {
    const service2 = createService();
    service2.tasks.findOne = vi.fn(async (_userId: string, id: string) => {
      if (id !== 't1') throw new Error('not found');
      return { id, title: 'Task' };
    });
    service2.areas.findOne = vi.fn(async (_userId: string, id: string) => {
      if (id !== 'a1') throw new Error('not found');
      return { id, title: 'Work' };
    });
    service2.projects.findOne = vi.fn(async (_userId: string, id: string) => {
      if (id !== 'p1') throw new Error('not found');
      return { id, title: 'Renovation' };
    });
    const resolver = new AgentToolsService(
      service2.tasks as never,
      service2.projects as never,
      service2.areas as never,
      service2.tags as never,
      service2.tagGroups as never,
      service2.subtasks as never,
      service2.projectHeadings as never,
      service2.feed as never,
    );

    const labels = await resolver.resolveCallLabels('user-1', {
      id: 'a1',
      projectId: 'p1',
      unknownId: 'missing',
      q: 'text',
    });
    expect(labels).toEqual({ a1: 'Work', p1: 'Renovation' });
    // No id-shaped args at all.
    await expect(resolver.resolveCallLabels('user-1', { q: 'text' })).resolves.toEqual({});
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

  it('update_task with cancelled=true cancels before updating (spec: task-cancelled)', async () => {
    await tool('update_task').execute('call-1', {
      id: 't1',
      cancelled: true,
    } as never);
    expect(service.tasks.cancel).toHaveBeenCalledWith('user-1', 't1');
    expect(service.tasks.update).toHaveBeenCalledWith('user-1', 't1', {});
  });

  it('update_task with cancelled=false uncancels', async () => {
    await tool('update_task').execute('call-1', {
      id: 't1',
      cancelled: false,
    } as never);
    expect(service.tasks.uncancel).toHaveBeenCalledWith('user-1', 't1');
  });

  it('complete_subtask with cancelled=true routes to cancel (spec: task-cancelled)', async () => {
    const result = await tool('complete_subtask').execute('call-1', {
      id: 's1',
      cancelled: true,
    } as never);
    expect(service.subtasks.cancel).toHaveBeenCalledWith('user-1', 's1');
    expect(service.subtasks.update).not.toHaveBeenCalled();
    const text = result.content[0] as { type: 'text'; text: string };
    expect(JSON.parse(text.text).status).toBe('CANCELLED');
  });

  it('complete_subtask with cancelled=false routes to uncancel', async () => {
    await tool('complete_subtask').execute('call-1', {
      id: 's1',
      cancelled: false,
    } as never);
    expect(service.subtasks.uncancel).toHaveBeenCalledWith('user-1', 's1');
  });

  it('includeCompleted description mentions cancelled tasks (schema compat)', () => {
    const listTasks = tool('list_tasks');
    const schema = listTasks.parameters as unknown as {
      properties: { includeCompleted: { description: string } };
    };
    expect(schema.properties.includeCompleted.description).toContain('cancelled');
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

  it('reorder tools forward ordered ids scoped to the user', async () => {
    await tool('reorder_tasks').execute('call-1', { orderedIds: ['t2', 't1'] } as never);
    expect(service.tasks.reorder).toHaveBeenCalledWith('user-1', ['t2', 't1']);

    await tool('reorder_projects').execute('call-2', { orderedIds: ['p2', 'p1'] } as never);
    expect(service.projects.reorder).toHaveBeenCalledWith('user-1', ['p2', 'p1']);

    await tool('reorder_areas').execute('call-3', { orderedIds: ['a1'] } as never);
    expect(service.areas.reorder).toHaveBeenCalledWith('user-1', ['a1']);

    await tool('reorder_subtasks').execute('call-4', {
      taskId: 't1',
      orderedIds: ['s2', 's1'],
    } as never);
    expect(service.subtasks.reorder).toHaveBeenCalledWith('user-1', 't1', ['s2', 's1']);
  });

  it('reorder_project_layout forwards the full layout payload', async () => {
    const result = await tool('reorder_project_layout').execute('call-1', {
      projectId: 'p1',
      ungroupedTaskIds: ['t1'],
      groups: [{ headingId: 'h1', taskIds: ['t2', 't3'] }],
    } as never);
    expect(service.projectHeadings.reorder).toHaveBeenCalledWith('user-1', {
      projectId: 'p1',
      ungroupedTaskIds: ['t1'],
      groups: [{ headingId: 'h1', taskIds: ['t2', 't3'] }],
    });
    expect((result.content[0] as { text: string }).text).toContain('"groupedTasks": 2');
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
