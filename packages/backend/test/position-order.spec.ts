import { positionBetween } from '@taskora/engine';

import { effectivePosition, sortByPosition } from '../src/common/position-order';

describe('position-order（REST 列表与桌面副本同一排序口径）', () => {
  it('按字节序排序；设备只改一行 position 时 web 端也看到新顺序', () => {
    const a = { id: 'a', position: 'a0' };
    const b = { id: 'b', position: 'a1' };
    const c = { id: 'c', position: 'a2' };
    expect(sortByPosition([c, a, b]).map((row) => row.id)).toEqual(['a', 'b', 'c']);

    // 设备把 c 拖到 a、b 之间：只写 c 一行
    const moved = {
      ...c,
      position: positionBetween(effectivePosition(a), effectivePosition(b)),
    };
    expect(sortByPosition([a, b, moved]).map((row) => row.id)).toEqual(['a', 'c', 'b']);
  });

  it('空 position 只是防御：排最前，不击穿排序', () => {
    const a = { id: 'a', position: 'a0' };
    const broken = { id: 'broken', position: null };
    expect(sortByPosition([a, broken]).map((row) => row.id)).toEqual(['broken', 'a']);
  });

  it('大小写字母按字节序（不是数据库默认排序规则）', () => {
    const upper = { id: 'upper', position: 'a0Z' };
    const lower = { id: 'lower', position: 'a0a' };
    expect(sortByPosition([lower, upper]).map((row) => row.id)).toEqual(['upper', 'lower']);
  });
});
