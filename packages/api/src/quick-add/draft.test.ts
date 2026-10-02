import { describe, expect, it, vi } from 'vitest';

import type {
  AreaResponseDto,
  CreateTaskDto,
  ProjectResponseDto,
  TagResponseDto,
  TaskResponseDto,
} from '@taskora/shared';
import { ProjectStatus, ScheduledType } from '@taskora/shared';

import {
  createFromQuickAddDraft,
  parseQuickAddInput,
  quickAddOpensInApp,
  type QuickAddDeps,
} from './draft';

function installDeps(data?: {
  tags?: string[];
  projects?: Array<{ id: string; title: string; status?: ProjectStatus }>;
  areas?: Array<{ id: string; title: string }>;
}) {
  const created: CreateTaskDto[] = [];
  const deps = {
    createTask: vi.fn(async (dto: CreateTaskDto) => {
      created.push(dto);
      return { id: `task-${created.length}` } as TaskResponseDto;
    }),
    updateTask: vi.fn(async (id: string) => ({ id }) as TaskResponseDto),
    getTags: vi.fn(async () => (data?.tags ?? []).map((id) => ({ id }) as TagResponseDto)),
    getProjects: vi.fn(async () =>
      (data?.projects ?? []).map(
        (p) =>
          ({
            id: p.id,
            title: p.title,
            status: p.status ?? ProjectStatus.ACTIVE,
          }) as ProjectResponseDto,
      ),
    ),
    getAreas: vi.fn(async () =>
      (data?.areas ?? []).map((a) => ({ id: a.id, title: a.title }) as AreaResponseDto),
    ),
  } satisfies QuickAddDeps;
  return { deps, created };
}

describe('parseQuickAddInput', () => {
  it('纯文本当标题；空输入返回 null', () => {
    expect(parseQuickAddInput('  买牛奶 ')).toEqual({ title: '买牛奶' });
    expect(parseQuickAddInput('   ')).toBeNull();
    expect(parseQuickAddInput(null)).toBeNull();
  });

  it('JSON 解析为草稿，非法字段丢弃', () => {
    const draft = parseQuickAddInput(
      JSON.stringify({
        title: '写周报',
        notes: '',
        when: { type: 'date', date: '2026-10-03' },
        reminderTime: '25:00',
        dueDate: 'tomorrow',
        projectId: 'p1',
        areaId: 'a1',
        tagIds: ['t1', 't1', '', 3],
      }),
    );
    expect(draft).toEqual({
      title: '写周报',
      when: { type: 'date', date: '2026-10-03' },
      projectId: 'p1',
      tagIds: ['t1'],
    });
  });

  it('Reminder 只随日期计划保留', () => {
    expect(
      parseQuickAddInput(
        JSON.stringify({ title: 'a', when: { type: 'someday' }, reminderTime: '09:00' }),
      ),
    ).toEqual({ title: 'a', when: { type: 'someday' } });
    expect(
      parseQuickAddInput(
        JSON.stringify({
          title: 'a',
          when: { type: 'date', date: '2026-10-03' },
          reminderTime: '09:00',
        }),
      ),
    ).toEqual({ title: 'a', when: { type: 'date', date: '2026-10-03' }, reminderTime: '09:00' });
  });

  it('损坏的 JSON / 缺标题的对象当作标题文本', () => {
    expect(parseQuickAddInput('{not json')).toEqual({ title: '{not json' });
    expect(parseQuickAddInput('{"notes":"x"}')).toEqual({ title: '{"notes":"x"}' });
  });
});

describe('createFromQuickAddDraft', () => {
  it('只有标题：进 Inbox，不读引用数据', async () => {
    const { deps, created } = installDeps();
    const result = await createFromQuickAddDraft({ title: '  买牛奶  ' }, deps);
    expect(created).toEqual([{ title: '买牛奶' }]);
    expect(result).toEqual({ taskId: 'task-1', placedIn: { kind: 'inbox' } });
    expect(deps.getProjects).not.toHaveBeenCalled();
    expect(deps.getTags).not.toHaveBeenCalled();
  });

  it('空标题不落库', async () => {
    const { deps } = installDeps();
    expect(await createFromQuickAddDraft({ title: '   ' }, deps)).toBeNull();
    expect(deps.createTask).not.toHaveBeenCalled();
  });

  it('各字段映射到 CreateTaskDto，Reminder 建好后补写', async () => {
    const { deps, created } = installDeps({
      tags: ['t1', 't2'],
      projects: [{ id: 'p1', title: '装修' }],
    });
    const result = await createFromQuickAddDraft(
      {
        title: '量尺寸',
        notes: '客厅',
        when: { type: 'date', date: '2026-10-03' },
        reminderTime: '09:30',
        dueDate: '2026-10-10',
        projectId: 'p1',
        tagIds: ['t1', 't2'],
      },
      deps,
    );
    expect(created).toEqual([
      {
        title: '量尺寸',
        notes: '客厅',
        scheduledType: ScheduledType.DATE,
        scheduledDate: '2026-10-03',
        dueDate: '2026-10-10',
        projectId: 'p1',
        tagIds: ['t1', 't2'],
      },
    ]);
    expect(deps.updateTask).toHaveBeenCalledWith('task-1', { reminderTime: '09:30' });
    expect(result?.placedIn).toEqual({ kind: 'project', id: 'p1', title: '装修' });
  });

  it('Someday 写 SOMEDAY 计划类型，不补写 Reminder', async () => {
    const { deps, created } = installDeps();
    await createFromQuickAddDraft(
      { title: '学吉他', when: { type: 'someday' }, reminderTime: '09:00' },
      deps,
    );
    expect(created[0]).toEqual({ title: '学吉他', scheduledType: ScheduledType.SOMEDAY });
    expect(deps.updateTask).not.toHaveBeenCalled();
  });

  it('已删除的 Tag 丢弃；不存在或已完成的项目回落 Inbox', async () => {
    const { deps, created } = installDeps({
      tags: ['t1'],
      projects: [{ id: 'done', title: '旧项目', status: ProjectStatus.COMPLETED }],
    });
    const gone = await createFromQuickAddDraft(
      { title: 'a', projectId: 'missing', tagIds: ['t1', 'deleted'] },
      deps,
    );
    const completed = await createFromQuickAddDraft({ title: 'b', projectId: 'done' }, deps);
    expect(created).toEqual([{ title: 'a', tagIds: ['t1'] }, { title: 'b' }]);
    expect(gone?.placedIn).toEqual({ kind: 'inbox' });
    expect(completed?.placedIn).toEqual({ kind: 'inbox' });
  });

  it('归属区域：存在则落入，不存在回落 Inbox', async () => {
    const { deps, created } = installDeps({ areas: [{ id: 'a1', title: '工作' }] });
    const hit = await createFromQuickAddDraft({ title: 'a', areaId: 'a1' }, deps);
    const miss = await createFromQuickAddDraft({ title: 'b', areaId: 'gone' }, deps);
    expect(created).toEqual([{ title: 'a', areaId: 'a1' }, { title: 'b' }]);
    expect(hit?.placedIn).toEqual({ kind: 'area', id: 'a1', title: '工作' });
    expect(miss?.placedIn).toEqual({ kind: 'inbox' });
  });
});

describe('quickAddOpensInApp', () => {
  it('只认 JSON 里的 openInApp === true', () => {
    expect(quickAddOpensInApp('{"title":"a","openInApp":true}')).toBe(true);
    expect(quickAddOpensInApp('{"title":"a","openInApp":"yes"}')).toBe(false);
    expect(quickAddOpensInApp('{"title":"a"}')).toBe(false);
    expect(quickAddOpensInApp('openInApp')).toBe(false);
    expect(quickAddOpensInApp('{broken')).toBe(false);
    expect(quickAddOpensInApp(null)).toBe(false);
  });
});
