import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';

/** 草稿里的一条 Subtask：key 只用于渲染与聚焦，不进 QuickAddDraft。 */
export interface QuickAddSubtask {
  key: string;
  title: string;
}

export interface QuickAddSubtaskListHandle {
  /** 在末尾追加一条空 Subtask 并聚焦（底栏「添加子任务」）。 */
  startDraft: () => void;
}

interface Props {
  subtasks: QuickAddSubtask[];
  onChange: (subtasks: QuickAddSubtask[]) => void;
}

const INPUT_CLASS =
  'h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-body font-normal shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0 max-md:h-11';

function focusEnd(el: HTMLInputElement) {
  el.focus();
  const end = el.value.length;
  el.setSelectionRange(end, end);
}

const newSubtask = (title = ''): QuickAddSubtask => ({ key: crypto.randomUUID(), title });

/** 粘贴内容并入当前输入后按行拆分；单行粘贴返回 null（走默认行为）。 */
function pastedLines(e: React.ClipboardEvent<HTMLInputElement>): string[] | null {
  const text = e.clipboardData.getData('text');
  if (!/\r?\n/.test(text)) return null;
  const el = e.currentTarget;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const merged = el.value.slice(0, start) + text + el.value.slice(end);
  return merged
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Quick Add 卡片里的子任务清单：只改本地草稿，提交时随草稿一起创建。
 * 键盘交互对齐展开任务的 TaskSubtaskList——Enter 在当前项下方插入（空项上
 * Enter 结束输入）、空项上 Backspace 删除、↑↓ 在项间移动、多行粘贴拆成多项。
 */
export const QuickAddSubtaskList = React.forwardRef<QuickAddSubtaskListHandle, Props>(
  function QuickAddSubtaskList({ subtasks, onChange }, ref) {
    const { t } = useTranslation();
    const inputs = React.useRef(new Map<string, HTMLInputElement>());
    // 目标输入框尚未渲染（刚插入的行）时挂起的聚焦请求，渲染后兑现。
    const pendingFocus = React.useRef<string | null>(null);

    React.useLayoutEffect(() => {
      const key = pendingFocus.current;
      const el = key ? inputs.current.get(key) : undefined;
      if (!el) return;
      pendingFocus.current = null;
      focusEnd(el);
    });

    const focusKey = (key: string | undefined) => {
      const el = key ? inputs.current.get(key) : undefined;
      if (el) focusEnd(el);
    };

    /** 在 index 处插入若干项，聚焦最后一项。 */
    const insertAt = (index: number, items: QuickAddSubtask[]) => {
      const next = [...subtasks];
      next.splice(index, 0, ...items);
      onChange(next);
      pendingFocus.current = items.at(-1)?.key ?? null;
    };

    React.useImperativeHandle(ref, () => ({
      startDraft: () => insertAt(subtasks.length, [newSubtask()]),
    }));

    const remove = (index: number) => {
      focusKey(subtasks[index - 1]?.key ?? subtasks[index + 1]?.key);
      onChange(subtasks.filter((_, i) => i !== index));
    };

    if (subtasks.length === 0) return null;

    return (
      <ul className="flex flex-col divide-y divide-border/60">
        {subtasks.map((subtask, index) => (
          <li
            key={subtask.key}
            className="flex min-h-7 items-center gap-2 text-body max-md:min-h-11"
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-muted-foreground/40"
            />
            <Input
              ref={(el) => {
                if (el) inputs.current.set(subtask.key, el);
                else inputs.current.delete(subtask.key);
              }}
              aria-label={t('task:subtasks')}
              placeholder={t('task:addSubtask')}
              value={subtask.title}
              onChange={(e) => {
                const title = e.target.value;
                onChange(subtasks.map((s) => (s.key === subtask.key ? { ...s, title } : s)));
              }}
              onPaste={(e) => {
                const lines = pastedLines(e);
                if (!lines) return;
                e.preventDefault();
                const [first = '', ...rest] = lines;
                const next = [...subtasks];
                next.splice(index, 1, { ...subtask, title: first }, ...rest.map(newSubtask));
                onChange(next);
                pendingFocus.current = next[index + rest.length]?.key ?? null;
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                  e.preventDefault();
                  // 空项上 Enter：结束输入，回到上一项
                  if (!subtask.title.trim()) remove(index);
                  else insertAt(index + 1, [newSubtask()]);
                } else if (e.key === 'Backspace' && subtask.title === '') {
                  e.preventDefault();
                  remove(index);
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  const target = subtasks[index + (e.key === 'ArrowUp' ? -1 : 1)];
                  if (!target) return;
                  e.preventDefault();
                  focusKey(target.key);
                }
              }}
              className={INPUT_CLASS}
            />
          </li>
        ))}
      </ul>
    );
  },
);
