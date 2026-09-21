import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatHlc, type OutboxEvent } from '@taskora/engine';
import type { ChangeEvent } from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { ChangeEventHub } from '../src/events/change-event-hub.service';
import { SyncEventBuffer } from '../src/sync/sync-event-buffer.service';
import { SyncHubService } from '../src/sync/sync-hub.service';

const USER = 'user-1';
const LATER_THAN_ROW = new Date('2027-01-01T00:00:00Z').getTime();

const taskRow = {
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
  sortOrder: 0,
  projectId: null,
  headingId: null,
  areaId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  userId: USER,
  fieldClocks: null,
  fieldDigests: null,
  tags: [] as Array<{ tagId: string }>,
};

function stamp(wallMs: number, counter: number, deviceId: string) {
  return formatHlc({ wallMs, counter, deviceId });
}

describe('SyncHubService（合并器集成）', () => {
  let service: SyncHubService;
  let buffer: SyncEventBuffer;
  let changeEventHub: ChangeEventHub;
  let mockPrisma: {
    task: Record<string, ReturnType<typeof vi.fn>>;
    $transaction: ReturnType<typeof vi.fn>;
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
  };

  function build() {
    buffer = new SyncEventBuffer();
    changeEventHub = new ChangeEventHub();
    service = new SyncHubService(mockPrisma as unknown as PrismaService, buffer, changeEventHub);
    service.onModuleInit();
  }

  beforeEach(() => {
    const emptyDelegate = () => ({
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    });
    mockPrisma = {
      task: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      subtask: emptyDelegate(),
      project: emptyDelegate(),
      projectHeading: emptyDelegate(),
      area: emptyDelegate(),
      tag: emptyDelegate(),
      tagGroup: emptyDelegate(),
      compactedEntity: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(),
    };
    mockPrisma.$transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run(mockPrisma),
    );
    build();
  });

  it('push 新实体：create 携带合并列 + fieldClocks，updatedAt 兑底不超过最大时钟；落库后按 wire 视图回填摘要', async () => {
    const createdRow = {
      ...taskRow,
      title: '新任务',
      fieldClocks: { title: stamp(LATER_THAN_ROW, 0, 'dev-a') },
    };
    let created = false;
    mockPrisma.task.findUnique.mockImplementation(async () => (created ? createdRow : null));
    mockPrisma.task.create.mockImplementation(async () => {
      created = true;
      return createdRow;
    });

    const result = await service.push(USER, [
      {
        entity: 'task',
        id: 'task-1',
        fields: { title: { value: '新任务', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') } },
      },
    ]);

    expect(result).toEqual({ acked: 1 });
    const createArgs = mockPrisma.task.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.title).toBe('新任务');
    expect(createArgs.data.userId).toBe(USER);
    expect(createArgs.data.fieldClocks).toEqual({
      title: stamp(LATER_THAN_ROW, 0, 'dev-a'),
    });
    // 补丁未携带 updatedAt → 兑底为最大时钟墙钟（不加 1，保持回声平局下两端值一致）
    expect((createArgs.data.updatedAt as Date).getTime()).toBe(LATER_THAN_ROW);

    // 落库后按 wire 视图回填 fieldDigests（回声幂等关键）：不可空列取
    // Prisma 默认值（sortOrder null → 0）、tagIds 排序，摘要与 serializeRow
    // 的重算口径一致，时钟不再被摘要检测重置。
    const backfillArgs = mockPrisma.task.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(backfillArgs.where.id).toBe('task-1');
    expect(backfillArgs.data.fieldDigests).toMatchObject({
      title: JSON.stringify('新任务'),
      sortOrder: JSON.stringify(0),
    });
    // 显式回写 updatedAt：防 @updatedAt 自动推到 now() 重新制造摘要不一致
    expect((backfillArgs.data.updatedAt as Date).getTime()).toBe(
      (createdRow.updatedAt as Date).getTime(),
    );
  });

  it('push 到已有实体：字段级合并，只有胜出字段进 UPDATE', async () => {
    const existingClocks = { title: stamp(1_000, 0, '0'), notes: stamp(1_000, 1, '0') };
    mockPrisma.task.findUnique.mockResolvedValue({
      ...taskRow,
      fieldClocks: existingClocks,
      fieldDigests: {
        title: JSON.stringify('旧标题'),
        notes: JSON.stringify('旧备注'),
      },
    });
    mockPrisma.task.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...taskRow,
        ...(data as object),
        fieldClocks: data.fieldClocks,
      }),
    );

    await service.push(USER, [
      {
        entity: 'task',
        id: 'task-1',
        fields: {
          dueDate: { value: '2026-02-01T00:00:00.000Z', hlc: stamp(LATER_THAN_ROW, 0, 'dev-b') },
        },
      },
    ]);

    const updateArgs = mockPrisma.task.update.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where.id).toBe('task-1');
    expect(updateArgs.data.dueDate).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    // 未触及字段（title/notes）不进 UPDATE 数据，但时钟完整写回
    expect(updateArgs.data).not.toHaveProperty('title');
    expect(updateArgs.data.fieldClocks).toMatchObject(existingClocks);
  });

  it('陈旧 push（时钟更旧）：不写库、不发事件（纯重放幂等）', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      ...taskRow,
      fieldClocks: { title: stamp(LATER_THAN_ROW, 0, 'dev-a') },
      fieldDigests: { title: JSON.stringify('设备写过') },
      title: '设备写过',
    });

    await service.push(USER, [
      {
        entity: 'task',
        id: 'task-1',
        fields: {
          title: { value: '更旧的编辑', hlc: stamp(1_000, 0, 'dev-z') },
        },
      },
    ]);

    expect(mockPrisma.task.update).not.toHaveBeenCalled();
    expect(buffer.pull(USER, 0).changes).toHaveLength(0);
  });

  it('任一事件写库失败时 push 失败，设备不得清空该批 Outbox', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(taskRow);
    mockPrisma.task.update.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.push(USER, [
        {
          entity: 'task',
          id: 'task-1',
          fields: { title: { value: '稍后重试', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') } },
        },
      ]),
    ).rejects.toThrow('database unavailable');
  });

  it('字段合并在事务内取得实体锁', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(taskRow);
    mockPrisma.task.update.mockResolvedValue({ ...taskRow, title: '串行写' });

    await service.push(USER, [
      {
        entity: 'task',
        id: 'task-1',
        fields: { title: { value: '串行写', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') } },
      },
    ]);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.any(String),
      'task-1',
    );
  });

  it('push 后设备可凭 cursor 拉到 EntityChange（含完整时钟与合成 Position）', async () => {
    const createdRow = {
      ...taskRow,
      title: '新任务',
      position: 'a0',
      fieldClocks: { title: stamp(LATER_THAN_ROW, 0, 'dev-a') },
      fieldDigests: { title: JSON.stringify('新任务') },
    };
    let created = false;
    mockPrisma.task.findUnique.mockImplementation(async () => (created ? createdRow : null));
    mockPrisma.task.create.mockImplementation(async () => {
      created = true;
      return createdRow;
    });

    // 已 bootstrap 的设备（cursor = 当前 seq）push 后拉增量
    const cursorBefore = buffer.currentSeq(USER);
    await service.push(USER, [
      {
        entity: 'task',
        id: 'task-1',
        fields: { title: { value: '新任务', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') } },
      },
    ]);

    const { changes, cursor, resync } = buffer.pull(USER, cursorBefore);
    expect(resync).toBe(false);
    expect(cursor).toBeGreaterThan(cursorBefore);
    const change = changes.find((c) => c.kind === 'entity');
    expect(change).toMatchObject({
      kind: 'entity',
      entity: 'task',
      id: 'task-1',
      fields: expect.objectContaining({ title: '新任务' }),
      clocks: { title: stamp(LATER_THAN_ROW, 0, 'dev-a') },
    });
  });

  it('collector tap：REST 写 → 同步推流（虚拟设备 0 基线），内容去重不重复推', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(taskRow);

    const cursorBefore = buffer.currentSeq(USER);
    changeEventHub.publish(USER, {
      entity: 'task',
      action: 'updated',
      id: 'task-1',
    } as ChangeEvent);
    // tap 异步处理
    await new Promise((resolve) => setTimeout(resolve, 0));

    const first = buffer.pull(USER, cursorBefore);
    expect(first.changes).toHaveLength(1);
    const firstSeq = first.cursor;

    // 同一内容再触发（例如设备 push 的回声）→ 去重，无新事件
    changeEventHub.publish(USER, {
      entity: 'task',
      action: 'updated',
      id: 'task-1',
    } as ChangeEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(buffer.currentSeq(USER)).toBe(firstSeq);
    expect(buffer.pull(USER, firstSeq).changes).toHaveLength(0);
  });

  it('collector tap：物理删除 → Compact Event', async () => {
    const cursorBefore = buffer.currentSeq(USER);
    changeEventHub.publish(USER, {
      entity: 'task',
      action: 'deleted',
      id: 'task-1',
    } as ChangeEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const { changes } = buffer.pull(USER, cursorBefore);
    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'compact', entity: 'task', ids: ['task-1'] }),
    );
  });

  it('publishCompact：持久登记完成后才下发压缩变更', async () => {
    const cursorBefore = buffer.currentSeq(USER);
    await service.publishCompact(USER, 'subtask', ['sub-1', 'sub-2']);
    expect(mockPrisma.compactedEntity.createMany).toHaveBeenCalled();
    const { changes } = buffer.pull(USER, cursorBefore);
    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'compact', entity: 'subtask', ids: ['sub-1', 'sub-2'] }),
    );
  });

  describe('Delete Request（ADR-0008：设备发起删除）', () => {
    it('归属校验通过：物理删除 + 级联删除 Subtask + 登记 + 广播', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 'task-1', userId: USER },
        { id: 'task-2', userId: USER },
      ]);
      mockPrisma.subtask.findMany.mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.subtask.deleteMany.mockResolvedValue({ count: 2 });

      const cursorBefore = buffer.currentSeq(USER);
      await service.push(USER, [], [{ entity: 'task', ids: ['task-1', 'task-2'] }]);

      // 归属校验：按 id 批量取行 + userId 过滤
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['task-1', 'task-2'] } } }),
      );
      // 级联：Subtask 先于父 Task 删除
      expect(mockPrisma.subtask.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['sub-1', 'sub-2'] } },
      });
      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['task-1', 'task-2'] } },
      });
      // 登记：Task 与级联 Subtask 都进 CompactedEntity
      expect(mockPrisma.compactedEntity.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ entity: 'task', entityId: 'task-1' }),
            expect.objectContaining({ entity: 'task', entityId: 'task-2' }),
          ]),
        }),
      );
      // 广播：级联 Subtask 的 Compact Event（每用户单调 seq）
      const { changes, cursor } = buffer.pull(USER, cursorBefore);
      expect(cursor).toBeGreaterThan(cursorBefore);
      expect(changes).toContainEqual(
        expect.objectContaining({ kind: 'compact', entity: 'subtask', ids: ['sub-1', 'sub-2'] }),
      );
    });

    it('越权 id 被拒绝：不删除、不广播（story 6）', async () => {
      mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1', userId: 'someone-else' }]);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 0 });

      const cursorBefore = buffer.currentSeq(USER);
      await service.push(USER, [], [{ entity: 'task', ids: ['task-1'] }]);

      expect(mockPrisma.task.deleteMany).not.toHaveBeenCalled();
      expect(buffer.pull(USER, cursorBefore).changes).toHaveLength(0);
    });

    it('Compact 永久获胜：已 compact 的实体，迟到字段写被静默丢弃', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      mockPrisma.compactedEntity.findUnique.mockResolvedValue({ id: 'cx-1' });

      await service.push(USER, [
        {
          entity: 'task',
          id: 'task-1',
          fields: { title: { value: '迟到编辑', hlc: stamp(LATER_THAN_ROW, 0, 'dev-b') } },
        },
      ]);

      expect(mockPrisma.task.create).not.toHaveBeenCalled();
      expect(buffer.pull(USER, 0).changes.every((c) => c.kind !== 'entity')).toBe(true);
    });
  });

  describe('归属校验（字段写与 Delete Request 同口径，story 6 对偶）', () => {
    it('越权 update（行属于他人）：不写库、不发事件', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...taskRow,
        userId: 'someone-else',
      });

      const cursorBefore = buffer.currentSeq(USER);
      await service.push(USER, [
        {
          entity: 'task',
          id: 'task-1',
          fields: {
            title: { value: '越权改写', hlc: stamp(LATER_THAN_ROW, 0, 'dev-attacker') },
          },
        },
      ]);

      expect(mockPrisma.task.update).not.toHaveBeenCalled();
      expect(buffer.pull(USER, cursorBefore).changes).toHaveLength(0);
    });

    it('越权 subtask update（父 Task 属于他人）：被拒绝', async () => {
      mockPrisma.subtask.findUnique.mockResolvedValue({
        id: 'sub-1',
        title: '步骤',
        status: 'ACTIVE',
        settledAt: null,
        sortOrder: 0,
        taskId: 'task-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        fieldClocks: null,
        fieldDigests: null,
      });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1', userId: 'someone-else' });

      await service.push(USER, [
        {
          entity: 'subtask',
          id: 'sub-1',
          fields: {
            title: { value: '越权', hlc: stamp(LATER_THAN_ROW, 0, 'dev-attacker') },
          },
        },
      ]);

      expect(mockPrisma.subtask.update).not.toHaveBeenCalled();
    });

    it('自己的行：正常合并（不误伤）', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(taskRow);
      mockPrisma.task.update.mockResolvedValue({ ...taskRow, title: '新标题' });

      await service.push(USER, [
        {
          entity: 'task',
          id: 'task-1',
          fields: {
            title: { value: '新标题', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') },
          },
        },
      ]);

      expect(mockPrisma.task.update).toHaveBeenCalled();
    });
  });

  it('虚拟设备 0 提交（Assistant）：与设备推送同一合并路径', async () => {
    const createdRow = {
      ...taskRow,
      title: '助手建的任务',
      fieldClocks: { title: stamp(LATER_THAN_ROW, 0, '0') },
    };
    let created = false;
    mockPrisma.task.findUnique.mockImplementation(async () => (created ? createdRow : null));
    mockPrisma.task.create.mockImplementation(async () => {
      created = true;
      return createdRow;
    });

    const event: OutboxEvent = {
      entity: 'task',
      id: 'task-1',
      fields: { title: { value: '助手建的任务', hlc: stamp(LATER_THAN_ROW, 0, '0') } },
    };
    await service.submitVirtualWrite(USER, event);

    expect(mockPrisma.task.create).toHaveBeenCalled();
    const { changes } = buffer.pull(USER, buffer.currentSeq(USER) - 1);
    expect(changes.some((c) => c.kind === 'entity')).toBe(true);
  });

  it('pull 缺口超出缓冲 → resync（设备须 bootstrap）', async () => {
    // 一次性灌满缓冲（500+）制造缺口
    for (let i = 0; i < 600; i++) {
      await service.publishCompact(USER, 'task', [`t${i}`]);
    }
    const firstSeq = buffer.currentSeq(USER) - 600 + 1;
    const { resync, changes } = buffer.pull(USER, firstSeq - 5);
    expect(resync).toBe(true);
    expect(changes).toHaveLength(0);
  });

  it('bootstrap：全量快照（含 legacy 基线时钟与合成 Position）', async () => {
    mockPrisma.task.findMany.mockResolvedValue([taskRow]);
    mockPrisma.compactedEntity.findMany.mockResolvedValue([
      { entity: 'task', entityId: 'task-deleted' },
      { entity: 'unknown', entityId: 'ignored' },
    ]);
    const result = await service.bootstrap(USER);
    expect(result.snapshot).toHaveLength(1);
    const entry = result.snapshot[0];
    expect(entry.entity).toBe('task');
    expect(entry.id).toBe('task-1');
    expect(entry.clocks.title).toBe(
      formatHlc({ wallMs: new Date('2026-01-02T00:00:00Z').getTime(), counter: 0, deviceId: '0' }),
    );
    expect(typeof entry.fields.position).toBe('string');
    expect(result.cursor).toBe(buffer.currentSeq(USER));
    expect(result.compacted).toEqual([{ entity: 'task', ids: ['task-deleted'] }]);
  });

  it('bootstrap 在读取快照前固定 cursor，期间发布的事件会在后续 pull 重放', async () => {
    const cursorBefore = buffer.currentSeq(USER);
    mockPrisma.task.findMany.mockImplementationOnce(async () => {
      buffer.publish(USER, {
        kind: 'compact',
        seq: 0,
        entity: 'task',
        ids: ['concurrent-delete'],
      });
      return [taskRow];
    });

    const result = await service.bootstrap(USER);

    expect(result.cursor).toBe(cursorBefore);
    expect(buffer.pull(USER, result.cursor).changes).toContainEqual(
      expect.objectContaining({ kind: 'compact', ids: ['concurrent-delete'] }),
    );
  });

  describe('subtask 认领（无 userId 列的实体）', () => {
    it('父 Task 属于该用户：subtask create 不带 userId、经父认领写入', async () => {
      const subtaskCodecRow = {
        id: 'sub-1',
        title: '步骤',
        status: 'ACTIVE',
        settledAt: null,
        sortOrder: 0,
        taskId: 'task-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        fieldClocks: null,
        fieldDigests: null,
      };
      let created = false;
      mockPrisma.subtask.findUnique.mockImplementation(async () =>
        created ? subtaskCodecRow : null,
      );
      mockPrisma.subtask.create.mockImplementation(async () => {
        created = true;
        return subtaskCodecRow;
      });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1', userId: USER });

      await service.push(USER, [
        {
          entity: 'subtask',
          id: 'sub-1',
          fields: {
            title: { value: '步骤', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') },
            taskId: { value: 'task-1', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') },
          },
        },
      ]);

      const createArgs = mockPrisma.subtask.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createArgs.data).not.toHaveProperty('userId');
      expect(createArgs.data.taskId).toBe('task-1');
    });

    it('父 Task 不属于该用户（或缺失）：subtask create 被拒绝', async () => {
      mockPrisma.subtask.findUnique.mockResolvedValue(null);
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1', userId: 'someone-else' });

      await service.push(USER, [
        {
          entity: 'subtask',
          id: 'sub-2',
          fields: { title: { value: '越权', hlc: stamp(LATER_THAN_ROW, 0, 'dev-a') } },
        },
      ]);

      expect(mockPrisma.subtask.create).not.toHaveBeenCalled();
    });
  });

  describe('失效引用清洗（同步毒丸防御）', () => {
    it('tagIds 携带已删 tag：物化时剔除失效 id，字段时钟提升为虚拟设备 0', async () => {
      const existingClocks = { tagIds: stamp(1_000, 0, '0') };
      mockPrisma.task.findUnique.mockResolvedValue({
        ...taskRow,
        fieldClocks: existingClocks,
        fieldDigests: { tagIds: JSON.stringify([]) },
      });
      // 引用探针：tag-alive 存在且属于本人；tag-dead 已 compact（物理
      // 删除 + 登记），探针经 compactedEntity 判 dead
      mockPrisma.tag.findMany.mockResolvedValue([{ id: 'tag-alive' }]);
      mockPrisma.compactedEntity.findMany.mockResolvedValue([
        { entity: 'tag', entityId: 'tag-dead', userId: USER },
      ]);
      mockPrisma.task.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          ...taskRow,
          ...(data as object),
          fieldClocks: data.fieldClocks,
        }),
      );

      const result = await service.push(USER, [
        {
          entity: 'task',
          id: 'task-1',
          fields: {
            tagIds: {
              value: ['tag-alive', 'tag-dead'],
              hlc: stamp(LATER_THAN_ROW, 0, 'dev-a'),
            },
          },
        },
      ]);

      expect(result).toEqual({ acked: 1 });
      const updateArgs = mockPrisma.task.update.mock.calls[0][0] as {
        where: { id: string };
        data: Record<string, unknown>;
      };
      // 物化只含存活 tag（不触发 FK violation，批次不成为毒丸）
      expect(updateArgs.data.tags).toEqual({
        deleteMany: {},
        create: [{ tagId: 'tag-alive' }],
      });
      // 清洗值以虚拟设备 0 的更新时钟下发，推送设备 pull 回声时真正应用
      const scrubClock = updateArgs.data.fieldClocks as Record<string, string>;
      expect(scrubClock.tagIds).not.toBe(stamp(LATER_THAN_ROW, 0, 'dev-a'));
      expect(scrubClock.tagIds.endsWith(':0')).toBe(true);
    });

    it('projectId 指向已删 project：物化为 null（对齐 compact 的 SetNull 语义）', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        ...taskRow,
        projectId: 'project-old',
        fieldClocks: { projectId: stamp(1_000, 0, '0') },
        fieldDigests: { projectId: JSON.stringify('project-old') },
      });
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.compactedEntity.findUnique.mockImplementation(
        async ({
          where,
        }: {
          where: { userId_entity_entityId?: { entityId?: string } };
        }) =>
          where.userId_entity_entityId?.entityId === 'project-gone'
            ? { entity: 'project', entityId: 'project-gone', userId: USER }
            : null,
      );
      mockPrisma.task.update.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          ...taskRow,
          ...(data as object),
          fieldClocks: data.fieldClocks,
        }),
      );

      await service.push(USER, [
        {
          entity: 'task',
          id: 'task-1',
          fields: {
            projectId: {
              value: 'project-gone',
              hlc: stamp(LATER_THAN_ROW, 0, 'dev-a'),
            },
          },
        },
      ]);

      const updateArgs = mockPrisma.task.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArgs.data.projectId).toBeNull();
    });

    it('subtask 字段写把 taskId 改到已删 Task：整事件丢弃，不落库', async () => {
      const subtaskRow = {
        id: 'sub-1',
        title: '步骤',
        status: 'ACTIVE',
        settledAt: null,
        sortOrder: 0,
        taskId: 'task-alive',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        fieldClocks: null,
        fieldDigests: null,
      };
      mockPrisma.subtask.findUnique.mockResolvedValue(subtaskRow);
      // 现存父 Task 归属校验通过；改写目标 task-gone 不存在且已 compact
      mockPrisma.task.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 'task-alive' ? { id: 'task-alive', userId: USER } : null,
      );
      mockPrisma.compactedEntity.findUnique.mockImplementation(
        async ({
          where,
        }: {
          where: { userId_entity_entityId?: { entityId?: string } };
        }) =>
          where.userId_entity_entityId?.entityId === 'task-gone'
            ? { entity: 'task', entityId: 'task-gone', userId: USER }
            : null,
      );

      await service.push(USER, [
        {
          entity: 'subtask',
          id: 'sub-1',
          fields: {
            taskId: {
              value: 'task-gone',
              hlc: stamp(LATER_THAN_ROW, 0, 'dev-a'),
            },
          },
        },
      ]);

      expect(mockPrisma.subtask.update).not.toHaveBeenCalled();
      expect(mockPrisma.subtask.create).not.toHaveBeenCalled();
    });
  });
});
