import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ProjectStatus,
  type AreaResponseDto,
  type ProjectResponseDto,
  type ReviewQueueItem,
} from '@taskora/shared';

import {
  parseReviewPath,
  reviewPath,
  reviewSnapshot,
  useReviewSession,
  type ReviewSessionInput,
} from './reviewSession';

const project = (id: string, overrides: Partial<ProjectResponseDto> = {}) =>
  ({ id, status: ProjectStatus.ACTIVE, trashedAt: null, ...overrides }) as ProjectResponseDto;
const area = (id: string) => ({ id }) as AreaResponseDto;

const P1: ReviewQueueItem = { kind: 'project', id: 'p1' };
const A1: ReviewQueueItem = { kind: 'area', id: 'a1' };
const P2: ReviewQueueItem = { kind: 'project', id: 'p2' };

/** 用一个可变的「路由」驱动 hook：go 改写 current 后重渲染。 */
function setup(initial: Partial<ReviewSessionInput> = {}) {
  const markReviewed = vi.fn();
  const postpone = vi.fn();
  let rerender: ((next: ReviewSessionInput) => void) | null = null;
  let props: ReviewSessionInput = {
    queueItems: [P1, A1, P2],
    projects: [project('p1'), project('p2')],
    areas: [area('a1')],
    current: P1,
    go: (item) => {
      props = { ...props, current: item };
      rerender?.(props);
    },
    markReviewed,
    postpone,
    ...initial,
  };
  const hook = renderHook((p: ReviewSessionInput) => useReviewSession(p), {
    initialProps: props,
  });
  rerender = hook.rerender;
  // 首次渲染里的跳转发生在 rerender 可用之前
  act(() => hook.rerender(props));
  return {
    hook,
    markReviewed,
    postpone,
    current: () => props.current,
    update: (patch: Partial<ReviewSessionInput>) => {
      props = { ...props, ...patch };
      act(() => hook.rerender(props));
    },
  };
}

describe('回顾路由', () => {
  it('对象 ↔ 路径；走完回到列表', () => {
    expect(reviewPath(P1)).toBe('/review/project/p1');
    expect(reviewPath(null)).toBe('/review');
    expect(parseReviewPath('area/a1')).toEqual(A1);
    expect(parseReviewPath('')).toBeNull();
  });

  it('快照：待回顾队列；进入的对象尚未到期时放在最前', () => {
    expect(reviewSnapshot([P1, A1], A1)).toEqual([P1, A1]);
    expect(reviewSnapshot([P1, A1], P2)).toEqual([P2, P1, A1]);
  });
});

describe('useReviewSession', () => {
  it('从列表进入时取快照；之后变为待回顾的对象不进入本轮快照', () => {
    const s = setup();
    s.update({ queueItems: [P1, A1, P2, { kind: 'project', id: 'late' }] });
    expect(s.hook.result.current.snapshot).toEqual([P1, A1, P2]);
    expect(s.hook.result.current.index).toBe(0);
  });

  it('刷新 / 深链停在队列中的对象：从它所在位置继续', () => {
    const s = setup({ current: P2 });
    expect(s.current()).toEqual(P2);
    expect(s.hook.result.current.index).toBe(2);
  });

  it('回到列表即结束本轮；再次进入按当时的待回顾队列重建', () => {
    const s = setup();
    s.update({ current: null });
    expect(s.hook.result.current.snapshot).toBeNull();
    s.update({ queueItems: [A1], current: A1 });
    expect(s.hook.result.current.snapshot).toEqual([A1]);
  });

  it('标记已回顾：写入当前对象并前进；走完回到列表', () => {
    const s = setup();
    act(() => s.hook.result.current.markNext());
    expect(s.markReviewed).toHaveBeenCalledWith(P1);
    expect(s.current()).toEqual(A1);
    act(() => s.hook.result.current.markNext());
    act(() => s.hook.result.current.markNext());
    expect(s.markReviewed).toHaveBeenCalledTimes(3);
    expect(s.current()).toBeNull();
  });

  it('处理完去下一个未处理的：先往后，后面都处理过就从头找；全部处理完才结束', () => {
    const s = setup();
    // 先翻到最后一个处理它：回到前面第一个未处理的，而不是结束
    act(() => s.hook.result.current.jump(P2));
    act(() => s.hook.result.current.markNext());
    expect(s.current()).toEqual(P1);

    // 用「下一个」越过的对象不算处理过
    act(() => s.hook.result.current.next());
    act(() => s.hook.result.current.previous());
    act(() => s.hook.result.current.postponeNext('2026-04-01'));
    expect(s.current()).toEqual(A1);

    act(() => s.hook.result.current.markNext());
    expect(s.current()).toBeNull();
  });

  it('当前对象离开回顾：同样去下一个未处理的（可从头找）', () => {
    const s = setup();
    act(() => s.hook.result.current.jump(P2));
    s.update({ projects: [project('p1'), project('p2', { trashedAt: '2026-03-10' })] });
    expect(s.current()).toEqual(P1);
  });

  it('上一个 / 下一个只在快照里移动：不标记；到头、到尾时不可用，不结束本轮', () => {
    const s = setup();
    expect(s.hook.result.current.canGoPrevious).toBe(false);
    act(() => s.hook.result.current.next());
    act(() => s.hook.result.current.next());
    expect(s.current()).toEqual(P2);
    expect(s.hook.result.current.canGoNext).toBe(false);
    act(() => s.hook.result.current.next());
    expect(s.current()).toEqual(P2);
    act(() => s.hook.result.current.previous());
    expect(s.current()).toEqual(A1);
    expect(s.markReviewed).not.toHaveBeenCalled();
  });

  it('延后：写入新的下次回顾日并前进，不算已回顾；队列里算已处理', () => {
    const s = setup();
    act(() => s.hook.result.current.postponeNext('2026-04-01'));
    expect(s.postpone).toHaveBeenCalledWith(P1, '2026-04-01');
    expect(s.markReviewed).not.toHaveBeenCalled();
    expect(s.current()).toEqual(A1);
    expect(s.hook.result.current.statusOf(P1)).toBe('processed');
  });

  it('上一个：可回到已标记的对象', () => {
    const s = setup();
    expect(s.hook.result.current.canGoPrevious).toBe(false);
    act(() => s.hook.result.current.markNext());
    act(() => s.hook.result.current.previous());
    expect(s.current()).toEqual(P1);
  });

  it('队列状态：已处理 / 未处理（看过但没处理的仍是未处理）；可跳到任一对象', () => {
    const s = setup();
    act(() => s.hook.result.current.markNext());
    act(() => s.hook.result.current.next());
    const { statusOf, jump } = s.hook.result.current;
    expect([P1, A1, P2].map(statusOf)).toEqual(['processed', 'pending', 'pending']);
    act(() => jump(A1));
    expect(s.current()).toEqual(A1);
    expect(s.hook.result.current.statusOf(P2)).toBe('pending');
  });

  it('当前项目被了结 / 进 Trash、当前区域被删除：自动进入下一个，前后都跳过它', () => {
    const s = setup();
    s.update({ projects: [project('p1', { status: ProjectStatus.COMPLETED }), project('p2')] });
    expect(s.current()).toEqual(A1);
    expect(s.markReviewed).not.toHaveBeenCalled();
    expect(s.hook.result.current.canGoPrevious).toBe(false);
    s.update({}); // 效果里的跳转在下一次渲染才反映到返回值上
    expect(s.hook.result.current.statusOf(P1)).toBe('processed');

    s.update({ areas: [] });
    expect(s.current()).toEqual(P2);

    s.update({ projects: [project('p1', { status: ProjectStatus.COMPLETED })] }); // p2 进 Trash
    expect(s.current()).toBeNull();
  });
});
