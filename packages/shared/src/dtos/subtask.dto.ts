import type { TaskStatus } from '../enums/task.enum';

export interface CreateSubtaskDto {
  title: string;
  /** 客户端预生成的 UUID：连续插入时下一条可立即以它为 afterId，乐观行也不必换 id。 */
  id?: string;
  /** 插入到该 Subtask 之后（其后各项顺延）；缺省或找不到时追加在末尾。 */
  afterId?: string;
}

export interface UpdateSubtaskDto {
  title?: string;
  status?: TaskStatus;
}

export interface SubtaskResponseDto {
  id: string;
  title: string;
  status: TaskStatus;
  /** 了结时间（Settled At，ADR 0006）：status 为 COMPLETED/CANCELLED 时的了结时刻；字段名保留 completedAt 以兼容前端。 */
  completedAt: string | null;
  sortOrder: number;
  taskId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderSubtasksDto {
  orderedIds: string[];
}
