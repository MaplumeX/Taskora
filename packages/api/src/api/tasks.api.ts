/**
 * Task API — REST 实现的转发层。
 *
 * 真正的 HTTP 实现在 `tasks.api.rest.ts`；这里按当前注入的 TaskBackend
 * （默认 REST，桌面端注入 Engine，见 `task-backend.ts`）转发。导出名与
 * 签名保持不变，既有 import 无需改动。
 */

import { currentTaskBackend } from './task-backend';

export type { TaskQuery, TaskView } from './tasks.api.rest';

export function getTasks(...args: Parameters<typeof import('./tasks.api.rest').getTasks>) {
  return currentTaskBackend().getTasks(...args);
}

export function getTask(...args: Parameters<typeof import('./tasks.api.rest').getTask>) {
  return currentTaskBackend().getTask(...args);
}

export function createTask(...args: Parameters<typeof import('./tasks.api.rest').createTask>) {
  return currentTaskBackend().createTask(...args);
}

export function updateTask(...args: Parameters<typeof import('./tasks.api.rest').updateTask>) {
  return currentTaskBackend().updateTask(...args);
}

export function deleteTask(...args: Parameters<typeof import('./tasks.api.rest').deleteTask>) {
  return currentTaskBackend().deleteTask(...args);
}

export function restoreTask(...args: Parameters<typeof import('./tasks.api.rest').restoreTask>) {
  return currentTaskBackend().restoreTask(...args);
}

export function completeTask(...args: Parameters<typeof import('./tasks.api.rest').completeTask>) {
  return currentTaskBackend().completeTask(...args);
}

export function uncompleteTask(
  ...args: Parameters<typeof import('./tasks.api.rest').uncompleteTask>
) {
  return currentTaskBackend().uncompleteTask(...args);
}

export function cancelTask(...args: Parameters<typeof import('./tasks.api.rest').cancelTask>) {
  return currentTaskBackend().cancelTask(...args);
}

export function uncancelTask(...args: Parameters<typeof import('./tasks.api.rest').uncancelTask>) {
  return currentTaskBackend().uncancelTask(...args);
}

export function reorderTasks(
  ...args: Parameters<typeof import('./tasks.api.rest').reorderTasks>
) {
  return currentTaskBackend().reorderTasks(...args);
}

export function convertTaskToProject(
  ...args: Parameters<typeof import('./tasks.api.rest').convertTaskToProject>
) {
  return currentTaskBackend().convertTaskToProject(...args);
}

export function createSubtask(
  ...args: Parameters<typeof import('./tasks.api.rest').createSubtask>
) {
  return currentTaskBackend().createSubtask(...args);
}

export function updateSubtask(
  ...args: Parameters<typeof import('./tasks.api.rest').updateSubtask>
) {
  return currentTaskBackend().updateSubtask(...args);
}

export function deleteSubtask(
  ...args: Parameters<typeof import('./tasks.api.rest').deleteSubtask>
) {
  return currentTaskBackend().deleteSubtask(...args);
}

export function completeSubtask(
  ...args: Parameters<typeof import('./tasks.api.rest').completeSubtask>
) {
  return currentTaskBackend().completeSubtask(...args);
}

export function uncompleteSubtask(
  ...args: Parameters<typeof import('./tasks.api.rest').uncompleteSubtask>
) {
  return currentTaskBackend().uncompleteSubtask(...args);
}

export function cancelSubtask(
  ...args: Parameters<typeof import('./tasks.api.rest').cancelSubtask>
) {
  return currentTaskBackend().cancelSubtask(...args);
}

export function uncancelSubtask(
  ...args: Parameters<typeof import('./tasks.api.rest').uncancelSubtask>
) {
  return currentTaskBackend().uncancelSubtask(...args);
}

export function reorderSubtasks(
  ...args: Parameters<typeof import('./tasks.api.rest').reorderSubtasks>
) {
  return currentTaskBackend().reorderSubtasks(...args);
}
