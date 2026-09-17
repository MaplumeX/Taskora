import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';

import { MarkdownNotesEditor } from './MarkdownNotesEditor';

// Regression test: with `immediatelyRender: false`, `useEditorState`'s
// snapshot is created with `editor: null` and only refreshes after the
// first transaction. An editor created with initial content never
// dispatches one, so `data-empty` used to stay "true" and the placeholder
// rendered on top of existing notes.
describe('MarkdownNotesEditor', () => {
  it('marks the editor non-empty when the initial value has content', async () => {
    const { container } = render(
      <MarkdownNotesEditor
        value="some existing note"
        onChange={() => {}}
        onBlurCommit={() => {}}
        placeholder="备注…"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeTruthy();
    });

    const wrapper = container.querySelector('.notes-prose');
    expect(wrapper?.getAttribute('data-empty')).toBe('false');
  });

  it('marks the editor empty when the initial value is empty', async () => {
    const { container } = render(
      <MarkdownNotesEditor
        value=""
        onChange={() => {}}
        onBlurCommit={() => {}}
        placeholder="备注…"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeTruthy();
    });

    const wrapper = container.querySelector('.notes-prose');
    expect(wrapper?.getAttribute('data-empty')).toBe('true');
  });

  it('updates data-empty when the external value changes (server refresh)', async () => {
    const { container, rerender } = render(
      <MarkdownNotesEditor
        value=""
        onChange={() => {}}
        onBlurCommit={() => {}}
        placeholder="备注…"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).toBeTruthy();
    });

    const wrapper = container.querySelector('.notes-prose');
    expect(wrapper?.getAttribute('data-empty')).toBe('true');

    // External value arrives (e.g. query refresh) — the sync effect runs
    // setContent, which dispatches a transaction; the placeholder must
    // disappear.
    rerender(
      <MarkdownNotesEditor
        value="hello"
        onChange={() => {}}
        onBlurCommit={() => {}}
        placeholder="备注…"
      />,
    );
    await waitFor(() => {
      expect(wrapper?.getAttribute('data-empty')).toBe('false');
    });

    rerender(
      <MarkdownNotesEditor
        value=""
        onChange={() => {}}
        onBlurCommit={() => {}}
        placeholder="备注…"
      />,
    );
    await waitFor(() => {
      expect(wrapper?.getAttribute('data-empty')).toBe('true');
    });
  });
});
