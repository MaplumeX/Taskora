import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEngineInvalidator } from './engine-invalidation';

describe('createEngineInvalidator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('窗口内的多次变更合并为一次失效，实体取并集', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const invalidate = createEngineInvalidator(queryClient);

    invalidate(['task']);
    invalidate(['task']);
    invalidate(['project-heading']);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    const roots = spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(roots).toEqual(
      expect.arrayContaining(['["tasks"]', '["feed"]', '["project-headings"]']),
    );
    expect(new Set(roots).size).toBe(roots.length); // 每个 root 只失效一次
  });

  it('缺省实体（bootstrap）失效全部', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const invalidate = createEngineInvalidator(queryClient);
    invalidate(['subtask']);
    invalidate();
    vi.advanceTimersByTime(20);
    const roots = spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(roots).toEqual(expect.arrayContaining(['["areas"]', '["tag-groups"]', '["tasks"]']));
  });
});
