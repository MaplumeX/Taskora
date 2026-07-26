import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

export interface InlineTitleEditProps {
  value: string;
  placeholder?: string;
  autoFocusAndSelect?: boolean;
  onSubmit: (next: string) => void;
  className?: string;
  inputClassName?: string;
}

/**
 * Inline-editable title: shows an <h1> in display mode and a flat borderless
 * <input> in edit mode. Press Enter / blur to submit, Escape to cancel.
 *
 * - Empty (after trim) → toast error + stay in edit mode (rollback to value).
 * - Same as original → exit edit mode, no submit.
 * - Otherwise → call onSubmit + exit edit mode immediately (optimistic close).
 *
 * When `autoFocusAndSelect` is true (e.g. after creation with empty title),
 * the component starts in edit mode on mount and focuses the input. `select()`
 * is only called when `value` is non-empty.
 */
export function InlineTitleEdit({
  value,
  placeholder,
  autoFocusAndSelect = false,
  onSubmit,
  className,
  inputClassName,
}: InlineTitleEditProps) {
  const { t } = useTranslation('common');
  const [editing, setEditing] = React.useState(autoFocusAndSelect);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync draft when external value changes (e.g. after mutation/refetch) and
  // we're not currently editing.
  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const enterEdit = React.useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const exitEdit = React.useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  const commit = React.useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      toast.error(t('titleRequired'));
      setDraft(value);
      inputRef.current?.focus();
      // keep editing so the user can retry
      return;
    }
    if (trimmed === value.trim()) {
      setEditing(false);
      return;
    }
    onSubmit(trimmed);
    setEditing(false);
  }, [draft, value, onSubmit, t]);

  // Focus + select on entering edit mode
  React.useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    // Focus on next paint so the input is mounted
    const id = requestAnimationFrame(() => {
      el.focus();
      if (value) el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [editing, value]);

  if (!editing) {
    return (
      <h1
        onClick={enterEdit}
        className={cn(
          'cursor-text text-2xl font-semibold tracking-tight',
          className,
        )}
      >
        {value || placeholder}
      </h1>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          exitEdit();
        }
      }}
      className={cn(
        'border-0 bg-transparent px-0 py-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0 w-full outline-none',
        inputClassName,
        className,
      )}
    />
  );
}