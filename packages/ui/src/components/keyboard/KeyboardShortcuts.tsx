/**
 * 全局 keymap registry（ADR-0004）：window 级单点 keydown 监听，
 * 解析键位后统一派发动作。键位见 docs/keyboard-shortcuts.md。
 */

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  extendSelectionTo,
  flattenSelectionRows,
  useAssistantUiStore,
  useKeybindingsStore,
  useSelectionStore,
  type SelectionRow,
} from '@taskora/api';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { CreateTaskDto } from '@taskora/shared';
import {
  useCancelTask,
  useCompleteTask,
  useContentBottomActionsForRoute,
  viewOf,
  useCreateTask,
  useDeleteTask,
  usePageTaskContext,
  useReorderTasks,
  useRestoreTask,
  useUncancelTask,
  useUncompleteTask,
  useUiInteractionStore,
} from '@taskora/api';
import { cn } from '@/lib/utils';
import {
  BUCKET_ROUTES,
  detectKeyPlatform,
  resolveAction,
  type KeyAction,
  type KeyPlatform,
} from './keymap';
import { runReviewCommand, type ReviewCommand } from '@/components/review/reviewCommands';
import { KeyboardTagPicker, taggableSelection } from './KeyboardTagPicker';
import { useDockToPanel } from '@/components/agent/assistant-panel-layout';
import { useDuplicate } from '@/components/task/useDuplicate';

export { detectKeyPlatform };
export type { KeyPlatform };

/** Tauri v2 注入的内部对象（类型与 desktop 的全局声明保持一致）。 */
declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    __TAURI__?: unknown;
  }
}

/** 打字唤起的隐藏输入框（见 TypeToFindSink）。 */
function isTypeToFindSink(target: EventTarget | null): boolean {
  return (target as HTMLElement | null)?.dataset?.typeToFindSink !== undefined;
}

/** 行内编辑（输入框、textarea、tiptap contenteditable）聚焦时快捷键全部让路。 */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof (el as { closest?: unknown }).closest !== 'function') return false;
  if (isTypeToFindSink(el)) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  return !!el.closest('input, textarea, [contenteditable="true"]');
}

/** 事件来自助手面板内部（如面板输入框）。 */
function isInAssistantPanel(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return typeof el?.closest === 'function' && !!el.closest('[data-assistant-panel]');
}

/** Radix 浮层（Dialog/Popover/DropdownMenu/Listbox）打开时让路。 */
function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [data-state="open"][role="listbox"]',
  );
}

/** 打字唤起 Quick Find 的前提（事件级前提 isEditableTarget / hasOpenOverlay 已在前面判过）。 */
function canTypeToFind(pathname: string): boolean {
  if (pathname.startsWith('/agent')) return false;
  if (useSelectionStore.getState().selectedIds.length > 0) return false;
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return !coarse;
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

const REVIEW_COMMANDS: Partial<Record<KeyAction['type'], ReviewCommand>> = {
  reviewMarkNext: 'markNext',
  reviewPostpone: 'postpone',
  reviewSkip: 'next',
  reviewPrevious: 'previous',
};

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
  const cancelTask = useCancelTask();
  const uncancelTask = useUncancelTask();
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  const reorderTasks = useReorderTasks();
  const createTask = useCreateTask();
  const duplicate = useDuplicate();
  const createTaskContext = usePageTaskContext();
  const dockToPanel = useDockToPanel();
  /** ⇧⌘T 打开的 Tag Picker 作用的行（打开时的 Selection 快照）。 */
  const [tagPickerIds, setTagPickerIds] = useState<string[] | null>(null);

  // 页面切换后 Selection 重置，不残留对已不可见行的选中（story 25）。
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  useEffect(() => {
    clearSelection();
    setTagPickerIds(null);
  }, [pathname, clearSelection]);

  useEffect(() => {
    const resolvedPlatform = platform ?? detectKeyPlatform();

    const on_keydown = (e: KeyboardEvent) => {
      // 用户自定义键位（设置 → 快捷键）在事件时读取，改绑即时生效。
      const overrides = useKeybindingsStore.getState().overrides;
      const action = resolveAction(e, resolvedPlatform, overrides);
      // 助手面板开关（⌘J）：面板输入框里也要能收起面板，先于编辑态让路处理。
      if (action?.type === 'toggleAssistantPanel') {
        if (isEditableTarget(e.target) && !isInAssistantPanel(e.target)) return;
        // 面板只在桌面宽度出现（与 useIsDesktop 同阈值）。
        if (hasOpenOverlay() || !window.matchMedia('(min-width: 768px)').matches) return;
        e.preventDefault();
        if (pathname.startsWith('/agent')) dockToPanel();
        else useAssistantUiStore.getState().togglePanel();
        return;
      }
      // 编辑态让路（story 22）：行内编辑聚焦时快捷键全部让路。
      if (isEditableTarget(e.target)) return;
      // Space/Enter 走原生 button 的激活路径（如 Tab 聚焦 checkbox 后按
      // Space 勾选），避免与展开动作双重触发。注意只让路真实 <button>：
      // role="button" 的行 div 没有原生 Enter/Space 激活语义，若一并让路
      // 会导致 Tab 聚焦行后按 Enter/Space 完全无响应。
      const targetEl = e.target as HTMLElement | null;
      const onNativeButton =
        !!targetEl &&
        typeof targetEl.closest === 'function' &&
        !!targetEl.closest('button, input[type="checkbox"], [role="checkbox"]');
      if ((e.key === ' ' || e.key === 'Enter') && onNativeButton) return;
      // Radix 浮层打开时让路（Esc 等由浮层自行处理）。
      if (hasOpenOverlay()) return;
      // 输入法在隐藏输入框里组字：按键全归输入法，上屏后由 sink 唤起 Quick Find。
      if (isTypeToFindSink(e.target) && (e.isComposing || e.keyCode === 229)) return;

      if (!action) return;

      // 打字唤起 Quick Find：只在「没有行被选中」时（有 Selection 时单键属于
      // 列表操作）、非触控设备上生效；助手页不挂载 Quick Find。
      if (action.type === 'typeToFind') {
        if (!canTypeToFind(pathname)) return;
        e.preventDefault();
        useUiInteractionStore.getState().openSearch(action.seed);
        return;
      }
      // 回顾模式的键位：不在回顾模式时不拦截
      const reviewCommand = REVIEW_COMMANDS[action.type];
      if (reviewCommand) {
        if (runReviewCommand(reviewCommand)) e.preventDefault();
        return;
      }
      e.preventDefault();

      // focus 跟随 selection（roving tabindex）：键盘移动选中后把 DOM 焦点
      // 一并移到目标行，避免旧行残留 :focus-visible outline（黑色边框），
      // 也保证后续键盘事件从当前行出发。rAF 等待 React 重渲染后再聚焦。
      const focusSelectionRow = (id: string) => {
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(`[data-selection-row="${id}"]`)
            ?.focus({ preventScroll: true });
        });
      };

      /** 创建新行（任务/标题）后确保焦点离开旧行、交给新行的编辑入口。
       *
       * 新行挂载后自带自动聚焦（TaskItem 展开 → 标题输入框；
       * pendingAutoEditId → 标题输入框），但旧行可能仍持有 DOM 焦点
       * （且丢失选中后显示紫色 focus 环）。这里在两帧后检查：若焦点
       * 已落到新行内部则无需处理；否则释放旧行焦点，避免残留。 */
      const yieldFocusToNewRow = (id: string) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newRow = document.querySelector<HTMLElement>(
              `[data-selection-row="${id}"]`,
            );
            if (
              newRow &&
              document.activeElement instanceof Node &&
              newRow.contains(document.activeElement)
            ) {
              return;
            }
            const active = document.activeElement;
            if (
              active instanceof HTMLElement &&
              active.closest('[data-task-item], [data-selection-row]') &&
              !newRow?.contains(active)
            ) {
              active.blur();
            }
          });
        });
      };

      const selection = useSelectionStore.getState();
      const rows = flattenSelectionRows(selection);
      // Group Header 仍登记父级上下文，但不参与列表焦点移动。
      // 只跳过分组标题，独立 Project 行与项目内部 Heading 仍可导航。
      const navigationRows = rows.filter((r) => !r.groupHeader);
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
          if (navigationRows.length === 0) return;
          const delta = action.type === 'moveUp' ? -1 : 1;
          const current = selection.selectedIds.at(-1);
          let index = current ? navigationRows.findIndex((r) => r.id === current) : -1;
          if (index === -1) index = delta > 0 ? -1 : navigationRows.length;
          index = Math.max(0, Math.min(navigationRows.length - 1, index + delta));
          useSelectionStore.getState().setSelection([navigationRows[index].id]);
          useUiInteractionStore.getState().setExpandedId(null);
          focusSelectionRow(navigationRows[index].id);
          return;
        }
        case 'moveFirst':
        case 'moveLast': {
          if (navigationRows.length === 0) return;
          // Grouped View 组边界钳制（story 24）：选中行在组内时，
          // Alt+↑/↓ 只在同组行（groupHeaderId 相同）内跳首末，
          // 任务不会经键盘离开所在组。未分组行（无 groupHeaderId）
          // 彼此同组 —— 非分组页面所有行都未分组，行为与之前一致。
          const currentId = selection.selectedIds.at(-1);
          const currentRow = currentId ? rowById.get(currentId) : undefined;
          let pool = navigationRows;
          if (currentRow) {
            const clamped = navigationRows.filter(
              (r) => r.groupHeaderId === currentRow.groupHeaderId,
            );
            if (clamped.length > 0) pool = clamped;
          }
          const row = action.type === 'moveFirst' ? pool[0] : pool[pool.length - 1];
          useSelectionStore.getState().setSelection([row.id]);
          useUiInteractionStore.getState().setExpandedId(null);
          focusSelectionRow(row.id);
          return;
        }
        case 'extendUp':
        case 'extendDown': {
          // 光标朝该方向移到下一个任务行（多选只含任务行），选中锚点到光标的范围。
          if (taskRows.length === 0) return;
          const delta = action.type === 'extendUp' ? -1 : 1;
          const current = selection.selectedIds.at(-1);
          let index = current ? rows.findIndex((r) => r.id === current) : -1;
          if (index === -1) index = delta > 0 ? -1 : rows.length;
          let next = index + delta;
          while (next >= 0 && next < rows.length && rows[next].kind !== 'task') next += delta;
          if (next < 0 || next >= rows.length) return;
          useUiInteractionStore.getState().setExpandedId(null);
          extendSelectionTo(rows[next].id);
          focusSelectionRow(rows[next].id);
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
          const neighbor = neighborAfter(navigationRows, selection.selectedIds);
          const isLogbook = view === 'logbook';
          for (const row of targets) {
            // Logbook 中 ⌘K 撤销了结（story 26）：已完成的撤销完成，
            // 已取消的撤销取消（同一个键，两种了结都可反悔）；
            // 其他视图跳过已完成项。
            if (isLogbook) {
              if (row.cancelled) uncancelTask.mutate(row.id);
              else uncompleteTask.mutate(row.id);
            } else if (!row.completed) {
              completeTask.mutate(row.id);
            }
          }
          useSelectionStore.getState().setSelection(neighbor ? [neighbor.id] : []);
          if (neighbor) focusSelectionRow(neighbor.id);
          return;
        }
        case 'cancel': {
          // 取消与 complete 同型派发（story 9）：Selection 移动行为一致。
          const targets = selection.selectedIds
            .map((id) => rowById.get(id))
            .filter((r): r is SelectionRow => !!r && r.kind === 'task');
          if (targets.length === 0) return;
          const neighbor = neighborAfter(navigationRows, selection.selectedIds);
          const isLogbook = view === 'logbook';
          for (const row of targets) {
            if (isLogbook) {
              // Logbook 中取消键只作用于已取消行（撤销取消）。
              if (row.cancelled) uncancelTask.mutate(row.id);
            } else if (!row.completed && !row.cancelled) {
              cancelTask.mutate(row.id);
            }
          }
          useSelectionStore.getState().setSelection(neighbor ? [neighbor.id] : []);
          if (neighbor) focusSelectionRow(neighbor.id);
          return;
        }
        case 'delete': {
          const targets = selection.selectedIds
            .map((id) => rowById.get(id))
            .filter((r): r is SelectionRow => !!r && r.kind === 'task');
          if (targets.length === 0) return;
          const neighbor = neighborAfter(navigationRows, selection.selectedIds);
          // Trash 页遵循现有交互约定：⌫ 恢复（story 27）。
          if (view === 'trash') {
            for (const row of targets) restoreTask.mutate(row.id);
          } else {
            for (const row of targets) deleteTask.mutate(row.id);
          }
          useSelectionStore.getState().setSelection(neighbor ? [neighbor.id] : []);
          if (neighbor) focusSelectionRow(neighbor.id);
          return;
        }
        case 'expand': {
          const id = selection.selectedIds.at(-1);
          if (!id) return;
          if (rowById.get(id)?.kind !== 'task') return;
          // 与点击循环对齐（idle → selected → expanded → selected）：
          // 已展开时再按 Enter 收起；展开后 TaskItem 自行聚焦标题编辑
          // （输入框内 Enter 自身会保存并收起，不会冒泡到这里）。
          const ui = useUiInteractionStore.getState();
          const collapsing = ui.expandedId === id;
          ui.setExpandedId(collapsing ? null : id);
          // 收起时焦点从标题输入框归还行本身。
          if (collapsing) focusSelectionRow(id);
          return;
        }
        case 'newTaskBelow': {
          if (!showAddTask) return;
          const anchorId = selection.selectedIds.at(-1);
          const anchor = anchorId ? rowById.get(anchorId) : undefined;
          // Group Header 行「下方新建」（story 25）：任务落在该父级内
          // （projectId/areaId 预填，无 heading），页面上下文（如 Today
          // 的计划日期）保持生效。
          if (anchor?.groupHeader) {
            const payload: CreateTaskDto = {
              title: '',
              ...createTaskContext,
              ...anchor.groupHeader.createContext,
            };
            createTask.mutate(payload, {
              onSuccess: (created) => {
                useUiInteractionStore.getState().setExpandedId(created.id);
                useSelectionStore.getState().setSelection([created.id]);
                yieldFocusToNewRow(created.id);
              },
              onError: () => toast.error(t('common:createFailed')),
            });
            return;
          }
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
                // 展开行同时置为选中（与点击展开路径一致），否则 ⌫/⌘K
                // 等针对 selectedIds 的动作不作用于当前展开行。
                useSelectionStore.getState().setSelection([created.id]);
                if (orderedBefore.length + orderedAfter.length > 0) {
                  reorderTasks.mutate([...orderedBefore, created.id, ...orderedAfter]);
                }
                yieldFocusToNewRow(created.id);
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
          useUiInteractionStore.getState().openSearch();
          return;
        }
        case 'tags': {
          const targets = taggableSelection(selection.selectedIds);
          if (targets.length === 0) return;
          setTagPickerIds(targets.map((row) => row.id));
          return;
        }
        case 'duplicate': {
          // 作用于选中的任务行与项目行（组头、Heading 不算）；Trash 中不复制。
          if (view === 'trash') return;
          const targets = rows.filter(
            (r) =>
              selection.selectedIds.includes(r.id) &&
              !r.groupHeader &&
              (r.kind === 'task' || r.kind === 'project'),
          );
          if (targets.length === 0) return;
          // 选中副本；Logbook 里的副本是未完成的，落回原列表，选中保持不变。
          void duplicate(
            targets.map((r) => ({ id: r.id, kind: r.kind as 'task' | 'project' })),
            { selectCopies: view !== 'logbook' },
          ).then((copies) => {
            if (copies.length > 0 && view !== 'logbook') focusSelectionRow(copies.at(-1)!);
          });
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
    cancelTask,
    uncancelTask,
    deleteTask,
    restoreTask,
    reorderTasks,
    createTask,
    duplicate,
    createTaskContext,
    dockToPanel,
    t,
  ]);

  return (
    <>
      <TypeToFindSink pathname={pathname} />
      {tagPickerIds && (
        <KeyboardTagPicker
          ids={tagPickerIds}
          onClose={() => {
            setTagPickerIds(null);
            // 焦点还给最后一个选中行，Selection 不变
            const id = tagPickerIds.at(-1);
            requestAnimationFrame(() => {
              document
                .querySelector<HTMLElement>(`[data-selection-row="${id}"]`)
                ?.focus({ preventScroll: true });
            });
          }}
        />
      )}
    </>
  );
}

/**
 * 输入法的打字唤起：浏览器只在可编辑元素聚焦时把按键交给输入法，焦点在
 * 页面上时中文输入法的首键会以英文字母到达。所以在可以打字唤起、焦点又
 * 无处可落（body）时，让这个视觉隐藏的输入框持有焦点：非输入法按键仍由
 * keydown 唤起（preventDefault，不落进来）；输入法从首键起在这里组字，
 * 上屏后把结果作为 seed 唤起 Quick Find。有 Selection 时归还焦点，单键
 * 仍是列表操作。
 */
function TypeToFindSink({ pathname }: { pathname: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  // 点击链接常伴随路由切换、effect 重跑，标记要跨过这一轮
  const pendingByPointer = useRef(false);

  useEffect(() => {
    const sink = ref.current;
    if (!sink) return;
    let pointerDown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** byPointer：鼠标点完后，点中的链接/按钮留着的焦点也接管（键盘 Tab 来的不抢）。 */
    const claim = (byPointer = false) => {
      clearTimeout(timer);
      pendingByPointer.current ||= byPointer;
      // 等焦点转移落定（focusout 时 activeElement 还没更新）
      timer = setTimeout(() => {
        const byPointer = pendingByPointer.current;
        pendingByPointer.current = false;
        if (pointerDown || !canTypeToFind(pathname) || hasOpenOverlay()) return;
        const active = document.activeElement;
        // 行内编辑也位于 Selection 行内，不能因未选中该行而抢走编辑焦点。
        if (isEditableTarget(active)) return;
        const idle =
          !active ||
          active === document.body ||
          (byPointer && active !== sink) ||
          // 清空 Selection 后焦点残留在旧行上
          (useSelectionStore.getState().selectedIds.length === 0 &&
            !!active.closest('[data-selection-row]'));
        if (!idle) return;
        // 不打断页面上的文本选择
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        sink.focus({ preventScroll: true });
      });
    };
    const release = () => {
      if (document.activeElement === sink && !canTypeToFind(pathname)) sink.blur();
    };
    const onFocusOut = () => claim();
    const onPointerDown = () => {
      pointerDown = true;
    };
    const onPointerUp = () => {
      pointerDown = false;
      claim(true);
    };
    const unsubscribe = useSelectionStore.subscribe(() => {
      release();
      claim();
    });

    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    release();
    claim();
    return () => {
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
    };
  }, [pathname]);

  const flush = () => {
    setComposing(false);
    const sink = ref.current;
    if (!sink) return;
    const text = sink.value;
    sink.value = '';
    if (text.trim()) useUiInteractionStore.getState().openSearch(text);
  };

  // 外形与位置同 Quick Find 的输入栏：平时透明（输入法候选窗也贴着它弹出），
  // 组字时原地显形，让用户看到拼音进了搜索框；上屏后换成真正的 Quick Find。
  // input 始终是同一个节点，切换外观不打断组字。
  return (
    <>
      {composing && (
        <div aria-hidden className="fixed inset-0 z-50 bg-black/20 dark:bg-black/50" />
      )}
      <div
        aria-hidden={!composing}
        className={cn(
          'pointer-events-none fixed left-1/2 top-[12dvh] z-50 flex w-full max-w-xl -translate-x-1/2 items-center gap-2 rounded-xl bg-popover px-3 shadow-popover max-md:top-2 max-md:max-w-[calc(100vw-1.5rem)]',
          !composing && 'opacity-0',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={ref}
          data-type-to-find-sink=""
          type="text"
          tabIndex={-1}
          autoComplete="off"
          onCompositionStart={() => setComposing(true)}
          // 输入法组字结束（含 Esc 取消，此时为空）即唤起
          onCompositionEnd={flush}
          // 不经组字直接上屏的字符（如中文标点）
          onInput={(e) => {
            if (!(e.nativeEvent as InputEvent).isComposing) flush();
          }}
          onBlur={() => setComposing(false)}
          className="h-12 min-w-0 flex-1 bg-transparent text-body outline-none"
        />
      </div>
    </>
  );
}
