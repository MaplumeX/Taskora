import { describe, expect, it } from 'vitest';

import { formatHlc } from '@taskora/engine';

import { serializeRow, sameWireValue, toPrismaData, codecFor } from '../src/sync/entity-codec';

const codec = codecFor('task');

const baseRow = {
  id: 'task-1',
  title: '旧标题',
  notes: '旧备注',
  scheduledDate: null,
  dueDate: null,
  bucket: 'INBOX',
  scheduledType: 'NONE',
  status: 'ACTIVE',
  settledAt: null,
  trashedAt: null,
  position: null,
  projectId: null,
  headingId: null,
  areaId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  userId: 'user-1',
  fieldClocks: null,
  fieldDigests: null,
  tags: [{ tagId: 'tag-b' }, { tagId: 'tag-a' }],
};

const UPDATED_AT_WALL = new Date('2026-01-02T00:00:00Z').getTime();
const baseline = formatHlc({ wallMs: UPDATED_AT_WALL, counter: 0, deviceId: '0' });

describe('serializeRow（时钟基线）', () => {
  it('legacy 行（无 fieldClocks）：所有字段取虚拟设备 0 的基线，tagIds 从关系物化', () => {
    const state = serializeRow(codec, baseRow);
    expect(state.fields.title).toBe('旧标题');
    expect(state.fields.tagIds).toEqual(['tag-a', 'tag-b']); // 排序保证两端比较稳定
    expect(state.clocks.title).toBe(baseline);
    expect(state.clocks.tagIds).toBe(baseline);
    expect(Object.keys(state.clocks).sort()).toEqual(codec.def.fields.map((f) => f.name).sort());
  });

  it('存下的时钟即权威：列值变了也不重置（不再有摘要检测）；缺时钟的字段取基线', () => {
    const titleStamp = formatHlc({ wallMs: 1_000, counter: 5, deviceId: 'dev-a' });
    const row = {
      ...baseRow,
      title: '与上次合并不同的标题',
      fieldClocks: { title: titleStamp },
      fieldDigests: { title: JSON.stringify('旧标题') }, // 旧版遗留，忽略
    };
    const state = serializeRow(codec, row);
    expect(state.clocks.title).toBe(titleStamp);
    expect(state.clocks.notes).toBe(baseline);
    expect(state.fields.title).toBe('与上次合并不同的标题');
  });

  it('sameWireValue：按落库口径比较（日期键 vs ISO、tagIds 顺序、对象键序）', () => {
    expect(sameWireValue(codec, 'scheduledDate', '2026-03-05T00:00:00.000Z', '2026-03-05')).toBe(
      true,
    );
    expect(sameWireValue(codec, 'tagIds', ['a', 'b'], ['b', 'a'])).toBe(true);
    expect(
      sameWireValue(
        codec,
        'repeatRule',
        { unit: 'day', interval: 1, anchor: 'scheduled' },
        { anchor: 'scheduled', interval: 1, unit: 'day' },
      ),
    ).toBe(true);
    expect(sameWireValue(codec, 'notes', null, undefined)).toBe(true);
    expect(sameWireValue(codec, 'title', 'a', 'b')).toBe(false);
    expect(sameWireValue(codec, 'scheduledDate', '2026-03-05T00:00:00.000Z', '2026-03-06')).toBe(
      false,
    );
  });

  it('Position 原样下发；sortOrder 列不上 wire（协议 4）', () => {
    const state = serializeRow(codec, { ...baseRow, position: 'a1V' });
    expect(state.fields.position).toBe('a1V');
    expect(state.fields).not.toHaveProperty('sortOrder');
    expect(serializeRow(codec, baseRow).fields.position).toBeNull();
  });
});

describe('toPrismaData', () => {
  it('日期字段 ISO → Date、null 保留、非法日期剔除', () => {
    const data = toPrismaData(
      codec,
      {
        dueDate: '2026-02-01T00:00:00.000Z',
        trashedAt: null,
        scheduledDate: 'not-a-date',
      },
      ['dueDate', 'trashedAt', 'scheduledDate'],
    );
    expect(data.dueDate).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    expect(data.trashedAt).toBeNull();
    expect(data).not.toHaveProperty('scheduledDate');
  });

  it('tagIds → 关系物化（update 模式：deleteMany + create 整组替换）', () => {
    const data = toPrismaData(codec, { tagIds: ['tag-a', 'tag-b'] }, ['tagIds']);
    expect(data.tags).toEqual({
      deleteMany: {},
      create: [{ tagId: 'tag-a' }, { tagId: 'tag-b' }],
    });
  });

  it('tagIds → create 模式：纯 { create }（Prisma create 嵌套输入不接受 deleteMany）', () => {
    // 回归：v0.4.2 「同步后任务变 Inbox」事故——create 路径携带
    // deleteMany 会让 Prisma 把数据按 checked 输入校验（要求 user
    // connect、拒绝裸 userId）而拒掉整个设备 create 事件。
    const data = toPrismaData(codec, { tagIds: ['tag-a'] }, ['tagIds'], 'create');
    expect(data.tags).toEqual({ create: [{ tagId: 'tag-a' }] });
  });

  it('不可空列的 null 被剔除（交给 Prisma 列默认值）', () => {
    // 回归：不可空列的 null 透传曾让 unchecked create 校验失败，错误
    // 被报成 checked 变体的「Argument user is missing」。
    const data = toPrismaData(codec, { bucket: null, notes: null }, ['bucket', 'notes']);
    expect(data).not.toHaveProperty('bucket');
    expect(data.notes).toBeNull(); // 可空列的 null 照透传
  });

  it('非法枚举剔除、合法枚举透传', () => {
    const data = toPrismaData(
      codec,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'BOGUS' as any,
        bucket: 'ANYTIME',
      },
      ['status', 'bucket'],
    );
    expect(data).not.toHaveProperty('status');
    expect(data.bucket).toBe('ANYTIME');
  });
});
