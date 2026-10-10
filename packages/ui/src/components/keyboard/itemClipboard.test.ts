import { describe, expect, it } from 'vitest';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { dropPayloads, pageDropTarget, titlesFromText } from './itemClipboard';

describe('titlesFromText', () => {
  it('按行拆分，去掉列表记号、勾选框与空行', () => {
    expect(titlesFromText('- a\r\n* b\n• c\n1. d\n- [ ] e\n[x] f\n\n   \n g ')).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
  });

  it('不把普通的连字符当记号', () => {
    expect(titlesFromText('-5 度\nwell-known')).toEqual(['-5 度', 'well-known']);
  });
});

describe('pageDropTarget', () => {
  it('Inbox / Today / Anytime / Someday / 项目 / 区域是落点', () => {
    expect(pageDropTarget('/inbox')).toEqual({ kind: 'inbox' });
    expect(pageDropTarget('/today')).toEqual({ kind: 'today' });
    expect(pageDropTarget('/projects/p1')).toEqual({ kind: 'project', projectId: 'p1' });
    expect(pageDropTarget('/areas/a1')).toEqual({ kind: 'area', areaId: 'a1' });
  });

  it('其余页面没有落点', () => {
    for (const path of ['/upcoming', '/logbook', '/trash', '/search', '/tags/t1', '/calendar']) {
      expect(pageDropTarget(path)).toBeNull();
    }
  });
});

describe('dropPayloads', () => {
  const item = {
    status: TaskStatus.COMPLETED,
    bucket: TaskBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    projectId: 'p1',
    areaId: null,
  };

  it('任务合成一组、项目逐个；副本换成副本 id 且为未了结', () => {
    const payloads = dropPayloads(
      [
        { id: 't1', kind: 'task', item, tagIds: [] },
        { id: 'p2', kind: 'project', item: { ...item, projectId: null }, tagIds: [] },
        { id: 't2', kind: 'task', item, tagIds: [] },
      ],
      ['t1-copy', 'p2-copy', 't2-copy'],
    );
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({
      kind: 'tasks',
      tasks: [
        { id: 't1-copy', projectId: 'p1', status: TaskStatus.ACTIVE },
        { id: 't2-copy', projectId: 'p1', status: TaskStatus.ACTIVE },
      ],
    });
    expect(payloads[1]).toMatchObject({ kind: 'project', project: { id: 'p2-copy' } });
  });
});
