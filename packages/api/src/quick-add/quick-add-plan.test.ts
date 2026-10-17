import { describe, expect, it } from 'vitest';

import { planQuickAddTask, ProjectStatus, Start } from '@taskora/shared';

describe('planQuickAddTask', () => {
  it('只有标题：进 Inbox，无 Reminder、无 Subtask', () => {
    expect(planQuickAddTask({ title: '  买牛奶 ' })).toEqual({
      dto: { title: '买牛奶' },
      subtasks: [],
      placedIn: { kind: 'inbox' },
    });
  });

  it('空标题返回 null', () => {
    expect(planQuickAddTask({ title: '   ' })).toBeNull();
  });

  it('各字段映射；Reminder 随日期计划进入补写步骤', () => {
    const plan = planQuickAddTask(
      {
        title: '周报',
        notes: '附上数据',
        when: { type: 'date', date: '2026-10-20' },
        reminderTime: '09:30',
        dueDate: '2026-10-21',
        projectId: 'p1',
        tagIds: ['t1', 'gone'],
        subtasks: [' 整理 ', '', '发送'],
      },
      {
        project: { id: 'p1', title: '工作', status: ProjectStatus.ACTIVE },
        knownTagIds: new Set(['t1']),
      },
    );
    expect(plan).toEqual({
      dto: {
        title: '周报',
        notes: '附上数据',
        scheduledDate: '2026-10-20',
        dueDate: '2026-10-21',
        projectId: 'p1',
        tagIds: ['t1'],
      },
      reminderTime: '09:30',
      subtasks: ['整理', '发送'],
      placedIn: { kind: 'project', id: 'p1', title: '工作' },
    });
  });

  it('Someday 不带 Reminder', () => {
    const plan = planQuickAddTask({
      title: '学吉他',
      when: { type: 'someday' },
      reminderTime: '09:00',
    });
    expect(plan?.dto.start).toBe(Start.SOMEDAY);
    expect(plan?.reminderTime).toBeUndefined();
  });

  it('引用缺失、不匹配或项目已了结：回落 Inbox', () => {
    const draft = { title: 'x', projectId: 'p1' };
    expect(planQuickAddTask(draft)?.placedIn).toEqual({ kind: 'inbox' });
    expect(planQuickAddTask(draft, { project: null })?.placedIn).toEqual({ kind: 'inbox' });
    expect(
      planQuickAddTask(draft, {
        project: { id: 'p2', title: '别的', status: ProjectStatus.ACTIVE },
      })?.placedIn,
    ).toEqual({ kind: 'inbox' });
    expect(
      planQuickAddTask(draft, {
        project: { id: 'p1', title: '旧项目', status: ProjectStatus.COMPLETED },
      })?.dto.projectId,
    ).toBeUndefined();
    expect(planQuickAddTask({ title: 'x', areaId: 'a1' }, { area: null })?.placedIn).toEqual({
      kind: 'inbox',
    });
  });

  it('未提供已知 Tag 时丢弃全部 Tag', () => {
    expect(planQuickAddTask({ title: 'x', tagIds: ['t1'] })?.dto.tagIds).toBeUndefined();
  });
});
