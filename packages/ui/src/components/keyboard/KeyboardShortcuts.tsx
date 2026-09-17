/**
 * 全局 keymap registry（ADR-0004）：window 级单点 keydown 监听，
 * 解析键位后统一派发动作。键位见 docs/keyboard-shortcuts.md。
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  flattenSelectionRows,
  useSelectionStore,
  type SelectionRow,
} from '@taskora/api';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { CreateTaskDto } from '@taskora/shared';
import {
  useCompleteTask,
  useContentBottomActionsForRoute,
  viewOf,
  useCreateTask,
  useDeleteTask,
  usePageTaskContext,
  useReorderTasks,
  useRestoreTask,
  useUncompleteTask,
  useUiInteractionStore,
} from '@taskora/api';
import { BUCKET_ROUTES, resolveAction, type KeyPlatform } from './keymap';

/** Tauri v2 注入的内部对象（类型与 desktop 的全局声明保持一致）。 */
declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    __TAURI__?: unknown;
  }
}

export function detectKeyPlatform(): KeyPlatform {
  if (typeof window === 'undefined') return 'web';
  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (!isTauri) return 'web';
  const ua = navigator.userAgent;
  return /Mac|iPhone|iPad/.test(ua) ? 'mac' : 'windows';
}

/** 行内编辑（输入框、textarea、tiptap contenteditable）聚焦时快捷键全部让路。 */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof (el as { closest?: unknown }).closest !== 'function') return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  return !!el.closest('input, textarea, [contenteditable="true"]');
}

/** Radix 浮层（Dialog/Popover/DropdownMenu/Listbox）打开时让路。 */
function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [data-state="open"][role="listbox"]',
  );
}

/** 列表操作后，Selection 移到相邻行（story 28）。 */
function neighborAfter(rows: SelectionRow[], ids: string[]): SelectionRow | null {
  const lastIdx = Math.max(-1, ...ids.map((id) => rows.findIndex((r) => r.id === id)));
  for (let i = lastIdx + 1; i < rows.length; i++) {
    if (rows[i].kind === 'task') return rows[i];
  }
  for (let i = lastIdx - 1; i >= 0; i--) {
    if (rows[i].kind === 'task') return rows[i];
  }
  return null;
}

interface Props {
  /** 平台，默认自动检测；测试可注入。 */
  platform?: KeyPlatform;
}

export function KeyboardShortcuts({ platform }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    showAddTask,
    showAddProject,
    showAddHeading,
    handleAddTask,
    handleAddProject,
    handleAddHeading,
  } = useContentBottomActionsForRoute();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  const reorderTasks = useReorderTasks();
  const createTask = useCreateTask();
  const createTaskContext = usePageTaskContext();

  // 页面切换后 Selection 重置，不残留对已不可见行的选中（story 25）。
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  useEffect(() => {
    clearSelection();
  }, [pathname, clearSelection]);

  useEffect(() => {
    const resolvedPlatform = platform ?? detectKeyPlatform();

    const on_keydown = (e: KeyboardEvent) => {
      // 编辑态让路（story 22）：行内编辑聚焦时快捷键全部让路。
      if (isEditableTarget(e.target)) return;
      // Space/Enter 走按钮的原生 aria 路径（如 Tab 聚焦 checkbox 后按
      // Space 勾选、Enter 激活），避免与展开动作双重触发。
      const targetEl = e.target as HTMLElement | null;
      const onNativeButton =
        !!targetEl &&
        typeof targetEl.closest === 'function' &&
        !!targetEl.closest('button, [role="button"], [role="checkbox"]');
      if ((e.key === ' ' || e.key === 'Enter') && onNativeButton) return;
      // Radix 浮层打开时让路（Esc 等由浮层自行处理）。
      if (hasOpenOverlay()) return;

      const action = resolveAction(e, resolvedPlatform);
      if (!action) return;
      e.preventDefault();

      const selection = useSelectionStore.getState();
      const rows = flattenSelectionRows(selection);
      const taskRows = rows.filter((r) => r.kind === 'task');
      const view = viewOf(pathname);
      const rowById = new Map(rows.map((r) => [r.id, r]));

      switch (action.type) {
        case 'navigate': {
          navigate(BUCKET_ROUTES[action.index - 1]);
          return;
        }
        case 'back': {
          navigate(-1);
          return;
        }
        case 'moveUp':
        case 'moveDown': {
          if (rows.length === 0) return;
          const delta = action.type === 'moveUp' ? -1 : 1;
          const current = selection.selectedIds.at(-1);
          let index = current ? rows.findIndex((r) => r.id === current) : -1;
          if (index === -1) index = delta > 0 ? -1 : rows.length;
          index = Math.max(0, Math.min(rows.length - 1, index + delta));
          useSelectionStore.getState().setSelection([rows[index].id]);
          useUiInteractionStore.getState().setExpandedId(null);
          return;
        }
        case 'moveFirst':
        case 'moveLast': {
          if (rows.length === 0) return;
          const row = action.type === 'moveFirst' ? rows[0] : rows[rows.length - 1];
          useSelectionStore.getState().setSelection([row.id]);
          useUiInteractionStore.getState().setExpandedId(null);
          return;
        }
        case 'selectAll': {
          if (taskRows.length === 0) return;
          useSelectionStore.getState().setSelection(taskRows.map((r) => r.id));
          return;
        }
        case 'complete': {
          // Heading/Project 行不是完成动作的作用对象（story 23）。
          const targets = selection.selectedIds
            .map((id) => rowById.get(id))
            .filter((r): r is SelectionRow => !!r && r.kind === 'task');
          if (targets.length === 0) return;
          const neighbor = neighborAfter(rows, selection.selectedIds);
          const isLogbook = view === 'logbook';
          for (const row of targets) {
            // Logbook 中 ⌘K 撤销完成（story 26）；其他视图跳过已完成项。
            if (isLogbook) {
              uncompleteTask.mutate(row.id);
            } else if (!row.completed) {
              completeTask.mutate(row.id);
            }
          }
          useSelectionStore.getState().setSelection(neighbor ? [neighbor.id] : []);
          return;
        }
        case 'delete': {
          const targets = selection.selectedIds
            .map((id) => rowById.get(id))
            .filter((r): r is SelectionRow => !!r && r.kind === 'task');
          if (targets.length === 0) return;
          const neighbor = neighborAfter(rows, selection.selectedIds);
          // Trash 页遵循现有交互约定：⌫ 恢复（story 27）。
          if (view === 'trash') {
            for (const row of targets) restoreTask.mutate(row.id);
          } else {
            for (const row of targets) deleteTask.mutate(row.id);
          }
          useSelectionStore.getState().setSelection(neighbor ? [neighbor.id] : []);
          return;
        }
        case 'expand': {
          const id = selection.selectedIds.at(-1);
          if (!id) return;
          if (rowById.get(id)?.kind !== 'task') return;
          // 展开后 TaskItem 自行聚焦标题编辑（Enter 再次按下时编辑态让路）。
          useUiInteractionStore.getState().setExpandedId(id);
          return;
        }
        case 'newTaskBelow': {
          if (!showAddTask) return;
          const anchorId = selection.selectedIds.at(-1);
          const anchor = anchorId ? rowById.get(anchorId) : undefined;
          const anchorIndex = anchor
            ? taskRows.findIndex((r) => r.id === anchor.id)
            : -1;
          // 选中 task 行时，创建后把新任务排到选中项下方（跟随现有
          // reorderTasks 部分排序语义）；否则等同普通新建。
          if (anchor?.kind === 'task' && anchorIndex >= 0) {
            const orderedBefore = taskRows.slice(0, anchorIndex + 1).map((r) => r.id);
            const orderedAfter = taskRows.slice(anchorIndex + 1).map((r) => r.id);
            const payload: CreateTaskDto = { title: '', ...createTaskContext };
            createTask.mutate(payload, {
              onSuccess: (created) => {
                useUiInteractionStore.getState().setExpandedId(created.id);
                if (orderedBefore.length + orderedAfter.length > 0) {
                  reorderTasks.mutate([...orderedBefore, created.id, ...orderedAfter]);
                }
              },
              onError: () => toast.error(t('common:createFailed')),
            });
            return;
          }
          handleAddTask();
          return;
        }
        case 'newTask': {
          if (showAddTask) handleAddTask();
          return;
        }
        case 'newProject': {
          if (showAddProject) handleAddProject();
          return;
        }
        case 'newHeading': {
          if (showAddHeading) handleAddHeading();
          return;
        }
        case 'search': {
          useUiInteractionStore.getState().setSearchOpen(true);
          return;
        }
      }
    };

    window.addEventListener('keydown', on_keydown);
    return () => window.removeEventListener('keydown', on_keydown);
  }, [
    platform,
    pathname,
    navigate,
    showAddTask,
    showAddProject,
    showAddHeading,
    handleAddTask,
    handleAddProject,
    handleAddHeading,
    completeTask,
    uncompleteTask,
    deleteTask,
    restoreTask,
    reorderTasks,
    createTask,
    createTaskContext,
    t,
  ]);

  return null;
}
