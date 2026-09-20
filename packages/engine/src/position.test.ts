import { BASE_62_DIGITS, positionBetween, positionsBetween, rebalancePositions } from './position';

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
    let prev: string | null = null;
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
    let b: string | null = 'a1';
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
