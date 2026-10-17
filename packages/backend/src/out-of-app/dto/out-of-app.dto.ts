import { IsIn, IsInt, IsObject, IsString, IsUUID } from 'class-validator';

import type { ReminderActionKind } from '@taskora/engine';

const REMINDER_ACTIONS: ReminderActionKind[] = [
  'complete',
  'snooze15',
  'snooze60',
  'snoozeTomorrow',
];

/** 一次通知点击（Android 原生动作队列条目，与 ReminderActionRequest 同形）。 */
export class ReminderActionDto {
  @IsString()
  taskId!: string;

  @IsIn(REMINDER_ACTIONS)
  action!: ReminderActionKind;

  /** 通知对应的触发时刻（epoch ms），用于过期校验。 */
  @IsInt()
  firedFireAt!: number;

  /** 点击时刻（epoch ms）。 */
  @IsInt()
  tappedAt!: number;
}

/** 状态栏快速添加：id 由设备入队时生成，即新任务 id；draft 由 toQuickAddDraft 规整。 */
export class QuickAddDto {
  @IsUUID()
  id!: string;

  @IsObject()
  draft!: Record<string, unknown>;
}
