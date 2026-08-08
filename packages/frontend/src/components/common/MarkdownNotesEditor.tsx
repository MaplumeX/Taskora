import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';

interface MarkdownNotesEditorProps {
  value: string;
  onChange: (md: string) => void;
  onBlurCommit: () => void;
  placeholder?: string;
}

/**
 * Returns the editorProps.attributes object Tiptap applies to the
 * `.ProseMirror` contenteditable root. We expose `data-placeholder` here (not
 * on the React wrapper div) because the placeholder CSS uses `attr()` against
 * the host of the `::before` pseudo — and that host must be the
 * `.ProseMirror` element itself, not its outer container.
 */
function placeholderAttributes(placeholder?: string) {
  return { 'data-placeholder': placeholder ?? '' };
}

/**
 * Markdown WYSIWYG notes editor backed by Tiptap.
 *
 * - Initializes from / serializes to a Markdown string (`@tiptap/markdown`).
 * - Syncs external `value` changes into the editor without feedback loops.
 * - Commits on blur via `onBlurCommit` (preserves existing notes save semantics).
 * - Stops Enter/Space propagation so dnd-kit KeyboardSensor does not hijack
 *   typing inside sortable rows; Escape is left to bubble and collapse the row.
 */
export function MarkdownNotesEditor({
  value,
  onChange,
  onBlurCommit,
  placeholder,
}: MarkdownNotesEditorProps) {
  // When we programmatically `setContent` to sync an external value change,
  // Tiptap still fires `onUpdate`; this flag lets us skip `onChange` for that
  // update so we don't echo the value back to the parent and create a loop.
  const skipNextUpdate = useRef(false);

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: placeholderAttributes(placeholder),
    },
    onUpdate: ({ editor }) => {
      if (skipNextUpdate.current) {
        skipNextUpdate.current = false;
        return;
      }
      onChange(editor.getMarkdown());
    },
    onBlur: () => {
      onBlurCommit();
    },
  });

  // Sync external `value` changes (e.g. server refresh) into the editor.
  // Only setContent when it differs from the current serialized markdown to
  // avoid clobbering the caret during normal typing.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.getMarkdown();
    if (value !== current) {
      skipNextUpdate.current = true;
      editor.commands.setContent(value, { contentType: 'markdown' });
    }
  }, [value, editor]);

  // Keep `data-placeholder` on the `.ProseMirror` element in sync with the
  // latest prop value (e.g. on i18n language switch). useEditor bakes initial
  // editorProps at creation time, so we re-apply via setOptions when the prop
  // changes; ProseMirror then re-computes the editor's root DOM attributes.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: { attributes: placeholderAttributes(placeholder) },
    });
  }, [editor, placeholder]);

  // Track emptiness so we can toggle a CSS-driven placeholder. Tiptap
  // renders `.ProseMirror > <p><br/></p>` for an empty document, so the
  // wrapper is never `:empty`; we drive the placeholder via `data-empty`,
  // which the CSS combines with the `.ProseMirror[data-placeholder]` rule.
  const isEmpty = useEditorState({
    editor,
    selector: (ctx) => (ctx.editor ? ctx.editor.isEmpty : true),
  });

  return (
    <EditorContent
      editor={editor}
      data-empty={isEmpty ? 'true' : 'false'}
      onKeyDown={(e) => {
        // Prevent Enter/Space from bubbling to dnd-kit KeyboardSensor
        // listeners on sortable ancestor rows (would start a keyboard drag
        // and get stuck on single-item contexts). Escape is intentionally
        // allowed to bubble so it can collapse the expanded task row.
        //
        // We use the bubble phase (onKeyDown, not onKeyDownCapture) so that
        // ProseMirror's own keydown listener on `.ProseMirror` (registered
        // via addEventListener, fired during the at-target phase of the
        // dispatched keydown) has already processed the key (e.g. inserting a
        // newline on Enter) before this handler stops propagation upward.
        // Calling stopPropagation in the capture phase would prevent the
        // event from descending to `.ProseMirror` and break editor typing.
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
      className="prose prose-sm dark:prose-invert notes-prose min-h-[60px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
    />
  );
}