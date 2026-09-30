import { positionBetween, synthPosition } from '@taskora/engine';

import { effectivePosition, sortByPosition } from '../src/common/position-order';

describe('position-order（REST 列表与桌面副本同一排序口径）', () => {
  const at = (iso: string) => new Date(iso);

  it('缺 position 时按 sortOrder + createdAt 合成（与 hub 下发口径一致）', () => {
    const row = { position: null, sortOrder: 3, createdAt: at('2026-01-01T00:00:00Z') };
    expect(effectivePosition(row)).toBe(synthPosition(3, row.createdAt));
  });

  it('按字节序排序；设备只改一行 position 时 web 端也看到新顺序', () => {
    const a = { id: 'a', position: null, sortOrder: 0, createdAt: at('2026-01-03T00:00:00Z') };
    const b = { id: 'b', position: null, sortOrder: 0, createdAt: at('2026-01-02T00:00:00Z') };
    const c = { id: 'c', position: null, sortOrder: 0, createdAt: at('2026-01-01T00:00:00Z') };
    // legacy 语义：sortOrder 相同，新建的在前
    expect(sortByPosition([c, a, b]).map((row) => row.id)).toEqual(['a', 'b', 'c']);

    // 设备把 c 拖到 a、b 之间：只写 c 一行
    const moved = {
      ...c,
      position: positionBetween(effectivePosition(a), effectivePosition(b)),
    };
    expect(sortByPosition([a, b, moved]).map((row) => row.id)).toEqual(['a', 'c', 'b']);
  });

  it('大小写字母按字节序（不是数据库默认排序规则）', () => {
    const upper = { id: 'upper', position: 'a0Z', sortOrder: 0, createdAt: at('2026-01-01') };
    const lower = { id: 'lower', position: 'a0a', sortOrder: 0, createdAt: at('2026-01-01') };
    expect(sortByPosition([lower, upper]).map((row) => row.id)).toEqual(['upper', 'lower']);
  });
});
