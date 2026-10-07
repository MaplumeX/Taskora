import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

import { flipId, noopSortingStrategy } from '../../lib/dnd';

/** 分组容器接收空白落点，标题和行各有独立落点；反馈由实时占位表达。 */
export function UpcomingDropZone({
  id,
  taskIds,
  children,
}: {
  id: string;
  taskIds: string[];
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `container:${id}` });
  return (
    <div ref={setNodeRef} data-schedule-dropzone={id} className="flex flex-col gap-1">
      <SortableContext items={taskIds.map((id) => `task:${id}`)} strategy={noopSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

export function UpcomingGroupHeader({ id, children }: { id: string; children: ReactNode }) {
  const dndId = `header:${id}`;
  const { setNodeRef } = useDroppable({ id: dndId });
  return (
    <div ref={setNodeRef} {...flipId(dndId)} data-schedule-header={id}>
      {children}
    </div>
  );
}
