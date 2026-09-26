import { toDateKey, todayDateKey, parseCalendarDate } from '@/utils/date';
/**
 * 状态栏常驻通知的内容组装（android-status-bar，滴答清单形态）。
 *
 * 形态：折叠态单行——标题区显示当前一条未完成任务，action 按钮
 * 「>」切换下一条、「+」快速添加（见 controller/shell）。
 * 本文件只做纯排序/取行，不触碰系统 API、不做 i18n。
 */

export interface StatusBarTaskInput {
  title: string;
  /** 计划日期（ISO 8601）；Today 口径下必有值，防御 null。 */
  scheduledDate: string | null;
  sortOrder: number;
}

/** 逾期 = 计划日期的日历日早于今天（账号时区口径，与 Today 视图同源）。 */
function isOverdueDate(scheduledDate: string | null, now: Date): boolean {
  if (!scheduledDate) return false;
  try {
    return toDateKey(scheduledDate) < todayDateKey(now);
  } catch {
    return false;
  }
}

/** Today 口径任务按展示顺序排序：日期升序（逾期在前）、同日 sortOrder。 */
export function sortStatusBarTasks(tasks: StatusBarTaskInput[]): StatusBarTaskInput[] {
  return [...tasks].sort((a, b) => {
    const da = a.scheduledDate ? toDateKey(a.scheduledDate) : '';
    const db = b.scheduledDate ? toDateKey(b.scheduledDate) : '';
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  });
}

/** 单条任务的标题文本：逾期带 M/d 前缀。 */
export function taskLine(task: StatusBarTaskInput, now: Date): string {
  if (!isOverdueDate(task.scheduledDate, now)) return task.title;
  const date = parseCalendarDate(task.scheduledDate!);
  return `${date.getMonth() + 1}/${date.getDate()} · ${task.title}`;
}

/** 轮播标题：index 指向当前任务，多于一条时带 (i/N) 位置指示。 */
export function carouselTitle(tasks: StatusBarTaskInput[], index: number, now: Date): string {
  if (tasks.length === 0) return '';
  const clamped = ((index % tasks.length) + tasks.length) % tasks.length;
  const line = taskLine(tasks[clamped], now);
  return tasks.length > 1 ? `${line} (${clamped + 1}/${tasks.length})` : line;
}
