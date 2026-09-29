import {
  BASE_62_DIGITS,
  MAX_POSITION_LENGTH,
  positionBetween,
  positionsBetween,
  rebalancePositions,
  rebalanceSegments,
  repositionMinimal,
} from './position';

describe('positionBetween', () => {
  it('首条 Position 是 "a0"，追加在末尾则整数部分递增', () => {
    expect(positionBetween(null, null)).toBe('a0');
    expect(positionBetween('a0', null)).toBe('a1');
    expect(positionBetween('a1', null)).toBe('a2');
  });

  it('在两个整数键之间插入产生中点（"a0" 与 "a1" 之间是 "a0V"）', () => {
    expect(positionBetween('a0', 'a1')).toBe('a0V');
  });

  it('插在最前面（START 与最小键之间）', () => {
    const key = positionBetween(null, 'a0');
    expect(key < 'a0').toBe(true);
  });

  it('随机相邻对插入始终满足 a < key < b（性质测试）', () => {
    const keys = [positionBetween(null, null)];
    for (let i = 0; i < 200; i++) {
      keys.push(positionBetween(keys[keys.length - 1], null));
    }
    // 在随机位置反复插队
    for (let round = 0; round < 300; round++) {
      const idx = Math.floor(Math.random() * keys.length);
      const a = idx > 0 ? keys[idx - 1] : null;
      const b = keys[idx];
      const key = positionBetween(a, b);
      if (a != null) expect(key > a).toBe(true);
      if (b != null) expect(key < b).toBe(true);
      keys.splice(idx, 0, key);
    }
    // 整组仍然严格有序
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
  });

  it('非法输入（a >= b、尾零、非法字符）抛错', () => {
    expect(() => positionBetween('a1', 'a0')).toThrow();
    expect(() => positionBetween('a10', null)).toThrow(); // 分数尾零
    expect(() => positionBetween('a0!', null)).toThrow(); // 非法字符
  });

  it('positionsBetween 生成 n 个有序键', () => {
    const keys = positionsBetween('a0', 'a1', 5);
    expect(keys).toHaveLength(5);
    const all = ['a0', ...keys, 'a1'];
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1] < all[i]).toBe(true);
    }
  });

  it('rebalancePositions：无过长键时返回 null，有则生成保持顺序的短键', () => {
    expect(rebalancePositions(['a0', 'a1'])).toBeNull();
    // 反复在同一处插队制造超长键
    let a: string | null = 'a0';
    const b: string | null = 'a1';
    for (let i = 0; a!.length <= 30 && i < 500; i++) {
      a = positionBetween(a, b);
    }
    expect(a!.length).toBeGreaterThan(24);
    const rebalanced = rebalancePositions([a!, 'a1']);
    expect(rebalanced).not.toBeNull();
    expect(rebalanced![0].length).toBeLessThanOrEqual(4);
    expect(rebalanced![0] < rebalanced![1]).toBe(true);
    expect(BASE_62_DIGITS.length).toBe(62);
  });
});

describe('repositionMinimal', () => {
  const apply = (
    ordered: Array<{ id: string; position: string | null }>,
  ): { changes: number; sorted: string[] } => {
    const changes = repositionMinimal(ordered);
    const next = new Map(ordered.map((row) => [row.id, row.position]));
    for (const change of changes) next.set(change.id, change.position);
    const sorted = [...next].sort((a, b) => ((a[1] as string) < (b[1] as string) ? -1 : 1));
    return { changes: changes.length, sorted: sorted.map(([id]) => id) };
  };
  const keys = positionsBetween(null, null, 6);
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => ({ id, position: keys[index] }));

  it('单次拖动只写被拖的一行', () => {
    // 把 e 拖到 b 前面
    const ordered = [rows[0], rows[4], rows[1], rows[2], rows[3], rows[5]];
    expect(apply(ordered)).toEqual({ changes: 1, sorted: ['a', 'e', 'b', 'c', 'd', 'f'] });
  });

  it('拖到最前 / 最后', () => {
    expect(apply([rows[5], ...rows.slice(0, 5)])).toEqual({
      changes: 1,
      sorted: ['f', 'a', 'b', 'c', 'd', 'e'],
    });
    expect(apply([...rows.slice(1), rows[0]])).toEqual({
      changes: 1,
      sorted: ['b', 'c', 'd', 'e', 'f', 'a'],
    });
  });

  it('顺序未变不写', () => {
    expect(apply(rows).changes).toBe(0);
  });

  it('缺 Position 的行与完全逆序也能排成目标顺序', () => {
    const withNull = [rows[0], { id: 'x', position: null }, rows[1]];
    expect(apply(withNull).sorted).toEqual(['a', 'x', 'b']);
    const reversed = [...rows].reverse();
    expect(apply(reversed).sorted).toEqual(['f', 'e', 'd', 'c', 'b', 'a']);
  });
});

describe('rebalanceSegments', () => {
  const apply = (ordered: Array<{ id: string; position: string }>) => {
    const changes = rebalanceSegments(ordered);
    const next = new Map(ordered.map((row) => [row.id, row.position]));
    for (const change of changes) next.set(change.id, change.position);
    const sorted = [...next].sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([id]) => id);
    return { changes, next, sorted };
  };
  const long = (prefix: string) => prefix + 'V'.repeat(MAX_POSITION_LENGTH);

  it('没有膨胀键时不写任何行', () => {
    const rows = ['a0', 'a1', 'a2'].map((position, index) => ({ id: `r${index}`, position }));
    expect(rebalanceSegments(rows)).toEqual([]);
  });

  it('只重排膨胀键本身，两侧邻居不动', () => {
    const rows = [
      { id: 'a', position: 'a0' },
      { id: 'b', position: long('a0') },
      { id: 'c', position: 'a1' },
      { id: 'd', position: 'a2' },
    ];
    const { changes, next, sorted } = apply(rows);
    expect(changes.map((change) => change.id)).toEqual(['b']);
    expect(next.get('b')!.length).toBeLessThanOrEqual(MAX_POSITION_LENGTH);
    expect(sorted).toEqual(['a', 'b', 'c', 'd']);
  });

  it('连续一段膨胀键（含表头表尾）保持顺序', () => {
    const rows = [
      { id: 'a', position: long('Zz') },
      { id: 'b', position: long('Zz' + 'W') },
      { id: 'c', position: 'a0' },
      { id: 'd', position: long('a0') },
      { id: 'e', position: long('a0W') },
    ];
    const { changes, next, sorted } = apply(rows);
    expect(changes.map((change) => change.id).sort()).toEqual(['a', 'b', 'd', 'e']);
    expect([...next.values()].every((key) => key.length <= MAX_POSITION_LENGTH)).toBe(true);
    expect(sorted).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('邻居太近时向两侧扩大窗口，窗口外不动', () => {
    const near = 'a0' + 'V'.repeat(MAX_POSITION_LENGTH - 3);
    const rows = [
      { id: 'far', position: 'Zz' },
      { id: 'lo', position: near },
      { id: 'x', position: near + 'V' + 'V'.repeat(MAX_POSITION_LENGTH) },
      { id: 'hi', position: near + 'W' },
      { id: 'end', position: 'b0' },
    ];
    const { next, sorted } = apply(rows);
    expect(next.get('far')).toBe('Zz');
    expect(next.get('end')).toBe('b0');
    expect([...next.values()].every((key) => key.length <= MAX_POSITION_LENGTH)).toBe(true);
    expect(sorted).toEqual(['far', 'lo', 'x', 'hi', 'end']);
  });
});
