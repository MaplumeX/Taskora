/**
 * 导入计划与 format 升级（`.scratch/data-import` issue 02）：纯函数，不碰数据库。
 */
import { describe, expect, it } from 'vitest';

import { positionsBetween } from '@taskora/engine';
import { DATA_PACKAGE_FORMAT, type DataPackageData } from '@taskora/shared';

import { buildImportPlan, type ImportTarget } from '../src/data-package/import-plan';
import { DataPackageError, upgradeDataPackage } from '../src/data-package/package-format';

const [P1, P2, P3] = positionsBetween(null, null, 3);
const HASH_IN_PACKAGE = 'a'.repeat(64);
const HASH_IN_ACCOUNT = 'b'.repeat(64);
const HASH_NOWHERE = 'c'.repeat(64);

const emptyTarget: ImportTarget = {
  tags: [],
  lastPositions: {},
  blobHashes: new Set(),
  calendarUrls: new Set(),
};

function data(entities: DataPackageData['entities'], extra?: Partial<DataPackageData>) {
  return { entities, preferences: null, calendarSubscriptions: [], ...extra };
}

/** 递增的假 id，断言里一眼区分新旧。 */
function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

function plan(entities: DataPackageData['entities'], target = emptyTarget, extra = {}) {
  return buildImportPlan(
    { data: data(entities, extra), blobHashes: new Set([HASH_IN_PACKAGE]) },
    target,
    counter(),
  );
}

const write = (result: ReturnType<typeof plan>, entity: string, title: string) =>
  result.writes.find((w) => w.entity === entity && w.fields.title === title)!;

describe('buildImportPlan', () => {
  it('全部换新 id，引用一并改写，不残留包内 id', () => {
    const result = plan({
      area: [{ id: 'a1', fields: { title: '生活', tagIds: ['t1'] } }],
      tag: [{ id: 't1', fields: { title: '家', parentId: null } }],
      project: [{ id: 'p1', fields: { title: '搬家', areaId: 'a1', tagIds: [] } }],
      'project-heading': [{ id: 'h1', fields: { title: '打包', projectId: 'p1' } }],
      task: [
        {
          id: 'k1',
          fields: { title: '买纸箱', projectId: 'p1', headingId: 'h1', tagIds: ['t1'] },
        },
        { id: 'k2', fields: { title: '下一次', repeatSourceId: 'k1' } },
      ],
      subtask: [{ id: 's1', fields: { title: '量尺寸', taskId: 'k1' } }],
      attachment: [
        { id: 'f1', fields: { name: 'a.pdf', taskId: 'k1', blobHash: HASH_IN_PACKAGE } },
      ],
    });

    const sourceIds = ['a1', 't1', 'p1', 'h1', 'k1', 'k2', 's1', 'f1'];
    // Position 串（a0、a1…）可能与短 id 同形，比较前去掉
    const json = JSON.stringify(result.writes, (key, value: unknown) =>
      key === 'position' || key === 'feedPosition' ? undefined : value,
    );
    for (const id of sourceIds) expect(json).not.toContain(`"${id}"`);

    const area = write(result, 'area', '生活');
    const tag = write(result, 'tag', '家');
    const project = write(result, 'project', '搬家');
    const heading = write(result, 'project-heading', '打包');
    const task = write(result, 'task', '买纸箱');
    expect(area.fields.tagIds).toEqual([tag.id]);
    expect(project.fields.areaId).toBe(area.id);
    expect(heading.fields.projectId).toBe(project.id);
    expect(task.fields).toMatchObject({
      projectId: project.id,
      headingId: heading.id,
      tagIds: [tag.id],
    });
    expect(write(result, 'task', '下一次').fields.repeatSourceId).toBe(task.id);
    expect(write(result, 'subtask', '量尺寸').fields.taskId).toBe(task.id);
    expect(result.writes.find((w) => w.entity === 'attachment')!.fields.taskId).toBe(task.id);
    expect(result.stats.created).toEqual({
      tag: 1,
      area: 1,
      project: 1,
      'project-heading': 1,
      task: 2,
      subtask: 1,
      attachment: 1,
    });
  });

  it('被引用的实体先写：父 Tag 在子 Tag 前，task 在 subtask 前', () => {
    const result = plan({
      tag: [
        { id: 'child', fields: { title: '会议', parentId: 'parent' } },
        { id: 'parent', fields: { title: '工作', parentId: null } },
      ],
      task: [{ id: 'k1', fields: { title: 'x' } }],
      subtask: [{ id: 's1', fields: { title: 'y', taskId: 'k1' } }],
    });
    const order = result.writes.map((w) => `${w.entity}:${w.fields.title}`);
    expect(order).toEqual(['tag:工作', 'tag:会议', 'task:x', 'subtask:y']);
  });

  it('悬挂引用：标量置 null、数组剔除，子实体与 heading 丢弃并计数', () => {
    const result = plan({
      task: [
        {
          id: 'k1',
          fields: {
            title: '孤儿',
            projectId: 'gone',
            headingId: 'gone',
            areaId: 'gone',
            tagIds: ['gone'],
            repeatSourceId: 'gone',
          },
        },
      ],
      'project-heading': [{ id: 'h1', fields: { title: 'h', projectId: 'gone' } }],
      subtask: [{ id: 's1', fields: { title: 's', taskId: 'gone' } }],
      attachment: [{ id: 'f1', fields: { name: 'f', taskId: 'gone', blobHash: HASH_IN_PACKAGE } }],
      tag: [{ id: 't1', fields: { title: 't', parentId: 'gone' } }],
    });
    expect(write(result, 'task', '孤儿').fields).toMatchObject({
      projectId: null,
      headingId: null,
      areaId: null,
      tagIds: [],
      repeatSourceId: null,
    });
    expect(write(result, 'tag', 't').fields.parentId).toBeNull();
    expect(result.writes.map((w) => w.entity).sort()).toEqual(['tag', 'task']);
    expect(result.stats.skipped).toEqual({ 'missing-parent': 3 });
  });

  it('heading 被丢弃时，引用它的任务 headingId 置 null', () => {
    const result = plan({
      'project-heading': [{ id: 'h1', fields: { title: 'h', projectId: 'gone' } }],
      task: [{ id: 'k1', fields: { title: 'x', headingId: 'h1' } }],
    });
    expect(write(result, 'task', 'x').fields.headingId).toBeNull();
  });

  it('附件内容在包内或账号里才导入，否则跳过', () => {
    const result = plan(
      {
        task: [{ id: 'k1', fields: { title: 'x' } }],
        attachment: [
          { id: 'f1', fields: { name: '包内', taskId: 'k1', blobHash: HASH_IN_PACKAGE } },
          { id: 'f2', fields: { name: '账号里', taskId: 'k1', blobHash: HASH_IN_ACCOUNT } },
          { id: 'f3', fields: { name: '哪都没有', taskId: 'k1', blobHash: HASH_NOWHERE } },
        ],
      },
      { ...emptyTarget, blobHashes: new Set([HASH_IN_ACCOUNT]) },
    );
    const names = result.writes.filter((w) => w.entity === 'attachment').map((w) => w.fields.name);
    expect(names).toEqual(['包内', '账号里']);
    expect(result.stats.skipped).toEqual({ 'missing-blob': 1 });
  });

  it('Tag 按标题路径合并：命中的用现有 id、不写；子 Tag 挂到现有父下', () => {
    const target: ImportTarget = {
      ...emptyTarget,
      tags: [
        { id: 'existing-work', title: '工作', parentId: null },
        { id: 'existing-meeting', title: '会议', parentId: 'existing-work' },
        { id: 'existing-home-meeting', title: '会议', parentId: null },
      ],
    };
    const result = plan(
      {
        tag: [
          { id: 'work', fields: { title: ' 工作 ', parentId: null } },
          { id: 'meeting', fields: { title: '会议', parentId: 'work' } },
          { id: 'review', fields: { title: '复盘', parentId: 'work' } },
          { id: 'Work', fields: { title: 'work', parentId: null } },
        ],
        task: [{ id: 'k1', fields: { title: 'x', tagIds: ['meeting', 'review'] } }],
      },
      target,
    );
    const tags = result.writes.filter((w) => w.entity === 'tag');
    expect(tags.map((w) => w.fields.title)).toEqual(['复盘', 'work']);
    expect(write(result, 'tag', '复盘').fields.parentId).toBe('existing-work');
    expect(write(result, 'task', 'x').fields.tagIds).toEqual([
      'existing-meeting',
      write(result, 'tag', '复盘').id,
    ]);
    expect(result.stats.mergedTags).toBe(2);
    expect(result.stats.created.tag).toBe(2);
  });

  it('Position：项目 / 区域 / Tag 追加在现有末尾并保持原顺序', () => {
    const [last] = positionsBetween(P3, null, 1);
    const result = plan(
      {
        area: [
          { id: 'a2', fields: { title: '第二', position: P2 } },
          { id: 'a1', fields: { title: '第一', position: P1 } },
        ],
        project: [
          { id: 'p1', fields: { title: 'p1', position: P1 } },
          { id: 'p2', fields: { title: 'p2', position: P2 } },
        ],
        tag: [{ id: 't1', fields: { title: 't', position: P1 } }],
      },
      { ...emptyTarget, lastPositions: { area: last, project: last, tag: last } },
    );
    const first = write(result, 'area', '第一').fields.position as string;
    const second = write(result, 'area', '第二').fields.position as string;
    expect(first > last).toBe(true);
    expect(second > first).toBe(true);
    expect((write(result, 'project', 'p1').fields.position as string) > last).toBe(true);
    expect((write(result, 'tag', 't').fields.position as string) > last).toBe(true);
  });

  it('feed：任务与项目在同一键空间里追加，保持原混排顺序', () => {
    const [existingTask, existingFeed] = positionsBetween(P3, null, 2);
    const result = plan(
      {
        task: [
          { id: 'k1', fields: { title: '任务一', position: P1 } },
          { id: 'k3', fields: { title: '任务三', position: P3 } },
        ],
        project: [
          // 没有 Feed Position：feed 中退回 Position
          { id: 'p1', fields: { title: '项目', position: P2, feedPosition: null } },
        ],
      },
      { ...emptyTarget, lastPositions: { task: existingTask, feed: existingFeed } },
    );
    const t1 = write(result, 'task', '任务一').fields.position as string;
    const p = write(result, 'project', '项目').fields.feedPosition as string;
    const t3 = write(result, 'task', '任务三').fields.position as string;
    expect(t1 > existingFeed).toBe(true);
    expect(t1 < p && p < t3).toBe(true);
  });

  it('heading / subtask 在全新的父级里，保留原 Position', () => {
    const result = plan({
      project: [{ id: 'p1', fields: { title: 'p' } }],
      'project-heading': [{ id: 'h1', fields: { title: 'h', projectId: 'p1', position: P2 } }],
      task: [{ id: 'k1', fields: { title: 'x' } }],
      subtask: [{ id: 's1', fields: { title: 's', taskId: 'k1', position: P3 } }],
    });
    expect(write(result, 'project-heading', 'h').fields.position).toBe(P2);
    expect(write(result, 'subtask', 's').fields.position).toBe(P3);
  });

  it('只保留当前 hub 认识的实体与字段', () => {
    const result = plan({
      task: [{ id: 'k1', fields: { title: 'x', userId: 'someone', futureField: 1 } }],
      'future-entity': [{ id: 'z1', fields: {} }],
    });
    expect(write(result, 'task', 'x').fields).toEqual({ title: 'x', position: expect.any(String) });
    expect(result.stats.skipped).toEqual({ 'unknown-entity': 1 });
  });

  it('日历订阅按 url 去重', () => {
    const subscription = (url: string) => ({ name: 'n', url, color: 'red', enabled: true });
    const result = plan(
      {},
      { ...emptyTarget, calendarUrls: new Set(['https://a']) },
      {
        calendarSubscriptions: [
          subscription('https://a'),
          subscription('https://b'),
          subscription('https://b'),
        ],
      },
    );
    expect(result.calendarSubscriptions.map((s) => s.url)).toEqual(['https://b']);
    expect(result.stats.skipped).toEqual({ 'duplicate-calendar': 2 });
    expect(result.stats.created.calendarSubscriptions).toBe(1);
  });
});

describe('upgradeDataPackage', () => {
  const manifest = (format: number) => ({
    format,
    exportId: 'e',
    exportedAt: '2026-10-16T00:00:00.000Z',
    hubVersion: '1.0.1',
    includesBlobs: false,
    counts: {},
  });

  it('当前 format 原样通过，缺省项补齐', () => {
    const result = upgradeDataPackage(manifest(DATA_PACKAGE_FORMAT), {
      entities: { task: [{ id: 'k1', fields: { title: 'x' } }] },
    });
    expect(result.data).toEqual({
      entities: { task: [{ id: 'k1', fields: { title: 'x' } }] },
      preferences: null,
      calendarSubscriptions: [],
    });
  });

  it('更高的 format 拒绝', () => {
    expect(() => upgradeDataPackage(manifest(DATA_PACKAGE_FORMAT + 1), { entities: {} })).toThrow(
      expect.objectContaining({ code: 'unsupported-format' }),
    );
  });

  it('结构无效拒绝', () => {
    for (const [m, d] of [
      [null, { entities: {} }],
      [manifest(DATA_PACKAGE_FORMAT), {}],
      [manifest(DATA_PACKAGE_FORMAT), { entities: { task: [{ id: 1, fields: {} }] } }],
    ] as const) {
      expect(() => upgradeDataPackage(m, d)).toThrow(DataPackageError);
    }
  });
});
