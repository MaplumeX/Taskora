import type { SyncEntity } from '@taskora/engine';

interface CompactRegistryClient {
  compactedEntity: {
    createMany(args: {
      data: Array<{ userId: string; entity: SyncEntity; entityId: string }>;
      skipDuplicates: boolean;
    }): Promise<unknown>;
  };
}

/**
 * 在物理删除所在事务内登记 Compact。调用方应先登记、再删除；这样提交后
 * 即使进程来不及广播，bootstrap 和迟到写检查仍能阻止实体复活。
 */
export async function registerCompacted(
  client: unknown,
  userId: string,
  entity: SyncEntity,
  ids: string[],
): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;
  await (client as CompactRegistryClient).compactedEntity.createMany({
    data: uniqueIds.map((entityId) => ({ userId, entity, entityId })),
    skipDuplicates: true,
  });
}
