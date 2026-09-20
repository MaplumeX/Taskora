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
  let mockPrisma: { task: Record<string, ReturnType<typeof vi.fn>> };

  function build() {
    buffer = new SyncEventBuffer();
    changeEventHub = new ChangeEventHub();
    service = new SyncHubService(
      mockPrisma as unknown as PrismaService,
      buffer,
      changeEventHub,
    );
    service.onModuleInit();
  }

  beforeEach(() => {
    const emptyDelegate = () => ({
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
    });
    mockPrisma = {
      task: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      subtask: emptyDelegate(),
      project: emptyDelegate(),
      projectHeading: emptyDelegate(),
      area: emptyDelegate(),
      tag: emptyDelegate(),
      tagGroup: emptyDelegate(),
    };
    build();
  });

  it('push 新实体：create 携带合并列 + fieldClocks + fieldDigests，updatedAt 不超过最大时钟', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(null);
    mockPrisma.task.create.mockResolvedValue({
      ...taskRow,
      title: '新任务',
      fieldClocks: { title: stamp(LATER_THAN_ROW, 0, 'dev-a') },
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
    expect(createArgs.data.fieldDigests).toMatchObject({ title: JSON.stringify('新任务') });
    expect((createArgs.data.updatedAt as Date).getTime()).toBe(LATER_THAN_ROW + 1);
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
    mockPrisma.task.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...taskRow,
      ...(data as object),
      fieldClocks: data.fieldClocks,
    }));

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

  it('publishCompact：显式下发压缩变更（空 Trash 的 Subtask 级联）', () => {
    const cursorBefore = buffer.currentSeq(USER);
    service.publishCompact(USER, 'subtask', ['sub-1', 'sub-2']);
    const { changes } = buffer.pull(USER, cursorBefore);
    expect(changes).toContainEqual(
      expect.objectContaining({ kind: 'compact', entity: 'subtask', ids: ['sub-1', 'sub-2'] }),
    );
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

  it('pull 缺口超出缓冲 → resync（设备须 bootstrap）', () => {
    // 一次性灌满缓冲（500+）制造缺口
    for (let i = 0; i < 600; i++) {
      service.publishCompact(USER, 'task', [`t${i}`]);
    }
    const firstSeq = buffer.currentSeq(USER) - 600 + 1;
    const { resync, changes } = buffer.pull(USER, firstSeq - 5);
    expect(resync).toBe(true);
    expect(changes).toHaveLength(0);
  });

  it('bootstrap：全量快照（含 legacy 基线时钟与合成 Position）', async () => {
    mockPrisma.task.findMany.mockResolvedValue([taskRow]);
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
      mockPrisma.subtask.findUnique.mockImplementation(async () => (created ? subtaskCodecRow : null));
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
});
