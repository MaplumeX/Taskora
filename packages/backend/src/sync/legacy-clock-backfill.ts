/**
 * 旧摘要时钟的一次性物化（local-first-v3 issue 05）。
 *
 * 旧版本的 REST 写直接改 Prisma、不经合并器，hub 靠 fieldDigests（每个
 * 字段上次合并时的值摘要）推断哪些字段被 REST 改过：摘要不匹配的字段
 * 在序列化时以虚拟设备 0 @ 行 updatedAt 重置时钟。现在所有写都经合并器，
 * 存下的 fieldClocks 即权威，序列化不再做这层推断。
 *
 * 启动时把仍带摘要的行按旧规则算一次时钟写回 fieldClocks，并清空
 * fieldDigests——设备此前看到的就是这组时钟，结果不产生任何变更，也
 * 不入日志。合并写同样会清空 fieldDigests，所以清空即「已物化」。
 */

import { Prisma } from '@prisma/client';
import { formatHlc, SYNC_ENTITIES, type FieldClocks } from '@taskora/engine';

import type { PrismaService } from '../prisma/prisma.service';
import { codecFor, delegate, includeFor, VIRTUAL_DEVICE_ID, wireViewOfRow } from './entity-codec';

const TABLE_NAMES: Record<string, string> = {
  task: 'Task',
  subtask: 'Subtask',
  project: 'Project',
  'project-heading': 'ProjectHeading',
  area: 'Area',
  tag: 'Tag',
  attachment: 'Attachment',
};

const BATCH_SIZE = 500;

/** 返回物化的行数。 */
export async function materializeLegacyClocks(prisma: PrismaService): Promise<number> {
  let total = 0;
  for (const entity of SYNC_ENTITIES) {
    const codec = codecFor(entity);
    for (;;) {
      // 未扩展的客户端：只改时钟列，不产生 Change Event。
      const done = await prisma.rawTransaction(async (tx) => {
        const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "${TABLE_NAMES[entity]}" WHERE "fieldDigests" IS NOT NULL LIMIT ${BATCH_SIZE} FOR UPDATE`,
        );
        if (locked.length === 0) return 0;
        const rows = (await delegate(tx, codec.model).findMany({
          where: { id: { in: locked.map((row) => row.id) } },
          include: includeFor(codec),
        })) as Array<Record<string, unknown>>;
        for (const row of rows) {
          await delegate(tx, codec.model).update({
            where: { id: row.id },
            data: {
              fieldClocks: legacyClocks(codec, row),
              fieldDigests: Prisma.DbNull,
              // 列是 @updatedAt：显式写回原值，否则被推到 now()
              updatedAt: row.updatedAt,
            },
          });
        }
        return rows.length;
      });
      total += done;
      if (done < BATCH_SIZE) break;
    }
  }
  return total;
}

/** 旧序列化规则：摘要匹配的字段沿用存下的时钟，否则取基线。 */
function legacyClocks(codec: ReturnType<typeof codecFor>, row: Record<string, unknown>) {
  const baseline = formatHlc({
    wallMs: (row.updatedAt as Date).getTime(),
    counter: 0,
    deviceId: VIRTUAL_DEVICE_ID,
  });
  const storedClocks = (row.fieldClocks ?? {}) as FieldClocks;
  const storedDigests = (row.fieldDigests ?? {}) as Record<string, string>;
  const fields = wireViewOfRow(codec, row);
  const clocks: FieldClocks = {};
  for (const field of codec.def.fields) {
    const digest = JSON.stringify(fields[field.name]) ?? 'null';
    clocks[field.name] =
      storedDigests[field.name] === digest && storedClocks[field.name]
        ? storedClocks[field.name]
        : baseline;
  }
  return clocks;
}
