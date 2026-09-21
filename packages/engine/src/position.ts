/**
 * Position — fractional indexing 排序位次（CONTEXT.md「引擎与同步」）。
 *
 * Task/Project/Tag 的排序位次是普通字符串字段，纳入字段级 LWW：插队只需
 * 在两个邻居间生成新串，无需重排他人；并发拖拽各自收敛。字符串长度会随
 * 反复插队增长，由 rebalancePositions 偶尔摊平。
 *
 * 算法 vendored 自 https://www.npmjs.com/package/fractional-indexing
 * （CC0，基于 https://observablehq.com/@dgreensp/implementing-fractional-indexing），
 * 按仓库风格改写为 TS。
 */

export const BASE_62_DIGITS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** `a` 可为空串，`b` 为 null 或非空串且 `a < b`。不允许尾零。 */
function midpoint(a: string, b: string | null | undefined, digits: string): string {
  const zero = digits[0];
  if (b != null && a >= b) {
    throw new Error(`${a} >= ${b}`);
  }
  if (a.slice(-1) === zero || (b && b.slice(-1) === zero)) {
    throw new Error('trailing zero');
  }
  if (b) {
    // 去掉最长公共前缀；遍历中给 `a` 补零（`b` 不可能先于 `a` 结束）。
    let n = 0;
    while ((a[n] || zero) === b[n]) {
      n++;
    }
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n), digits);
    }
  }
  // 首位（或缺位）不同
  const digitA = a ? digits.indexOf(a[0]) : 0;
  const digitB = b != null ? digits.indexOf(b[0]) : digits.length;
  if (digitB - digitA > 1) {
    const midDigit = Math.round(0.5 * (digitA + digitB));
    return digits[midDigit];
  }
  // 首位相邻
  if (b && b.length > 1) {
    return b.slice(0, 1);
  }
  // `b` 为 null 或单个字符：递归补 `a` 的尾串
  return digits[digitA] + midpoint(a.slice(1), null, digits);
}

function getIntegerLength(head: string): number {
  if (head >= 'a' && head <= 'z') {
    return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  } else if (head >= 'A' && head <= 'Z') {
    return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  }
  throw new Error(`invalid order key head: ${head}`);
}

function getIntegerPart(key: string): string {
  const integerPartLength = getIntegerLength(key[0]);
  if (integerPartLength > key.length) {
    throw new Error(`invalid order key: ${key}`);
  }
  return key.slice(0, integerPartLength);
}

function validateInteger(int: string): void {
  if (int.length !== getIntegerLength(int[0])) {
    throw new Error(`invalid integer part of order key: ${int}`);
  }
}

/** 校验一个合法的 Position（非法即抛错，供外部输入防御）。 */
export function validatePosition(key: string, digits: string = BASE_62_DIGITS): void {
  const validChars = key.split('').every((char) => digits.includes(char));
  if (key === `A${digits[0].repeat(26)}` || !validChars) {
    throw new Error(`invalid order key: ${key}`);
  }
  const i = getIntegerPart(key);
  const f = key.slice(i.length);
  if (f.slice(-1) === digits[0]) {
    throw new Error(`invalid order key: ${key}`);
  }
}

/** 整数部分加一；到顶返回 null。 */
function incrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split('');
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = digits.indexOf(digs[i]) + 1;
    if (d === digits.length) {
      digs[i] = digits[0];
    } else {
      digs[i] = digits[d];
      carry = false;
    }
  }
  if (carry) {
    if (head === 'Z') {
      return `a${digits[0]}`;
    }
    if (head === 'z') {
      return null;
    }
    const h = String.fromCharCode(head.charCodeAt(0) + 1);
    if (h > 'a') {
      digs.push(digits[0]);
    } else {
      digs.pop();
    }
    return h + digs.join('');
  }
  return head + digs.join('');
}

/** 整数部分减一；到底返回 null。 */
function decrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split('');
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = digits.indexOf(digs[i]) - 1;
    if (d === -1) {
      digs[i] = digits.slice(-1);
    } else {
      digs[i] = digits[d];
      borrow = false;
    }
  }
  if (borrow) {
    if (head === 'a') {
      return `Z${digits.slice(-1)}`;
    }
    if (head === 'A') {
      return null;
    }
    const h = String.fromCharCode(head.charCodeAt(0) - 1);
    if (h < 'Z') {
      digs.push(digits.slice(-1));
    } else {
      digs.pop();
    }
    return h + digs.join('');
  }
  return head + digs.join('');
}

/**
 * 在 `a`（START 为 null）与 `b`（END 为 null）之间生成一个 Position，
 * 满足 `a < result < b`（字典序）。
 */
export function positionBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  digits: string = BASE_62_DIGITS,
): string {
  if (a != null) {
    validatePosition(a, digits);
  }
  if (b != null) {
    validatePosition(b, digits);
  }
  if (a != null && b != null && a >= b) {
    throw new Error(`${a} >= ${b}`);
  }
  if (a == null) {
    if (b == null) {
      return `a${digits[0]}`;
    }
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === `A${digits[0].repeat(26)}`) {
      return ib + midpoint('', fb, digits);
    }
    if (ib < b) {
      return ib;
    }
    const res = decrementInteger(ib, digits);
    if (res == null) {
      throw new Error('cannot decrement any more');
    }
    return res;
  }
  if (b == null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia, digits);
    return i == null ? ia + midpoint(fa, null, digits) : i;
  }
  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) {
    return ia + midpoint(fa, fb, digits);
  }
  const i = incrementInteger(ia, digits);
  if (i == null) {
    throw new Error('cannot increment any more');
  }
  if (i < b) {
    return i;
  }
  return ia + midpoint(fa, null, digits);
}

/** 生成 n 个介于 a、b 之间的有序 Position。 */
export function positionsBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  n: number,
  digits: string = BASE_62_DIGITS,
): string[] {
  if (n === 0) return [];
  if (n === 1) return [positionBetween(a, b, digits)];
  if (b == null) {
    let c = positionBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = positionBetween(c, b, digits);
      result.push(c);
    }
    return result;
  }
  if (a == null) {
    let c = positionBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = positionBetween(a, c, digits);
      result.push(c);
    }
    result.reverse();
    return result;
  }
  const mid = Math.floor(n / 2);
  const c = positionBetween(a, b, digits);
  return [
    ...positionsBetween(a, c, mid, digits),
    c,
    ...positionsBetween(c, b, n - mid - 1, digits),
  ];
}

/**
 * 后台 re-balance：当某串 Position 过长（默认 > 24 字符，即反复插队的
 * 痕迹）时，为整组生成一批等距、短小的新 Position（保持原顺序）。
 * 无需重排时返回 null。
 */
export function rebalancePositions(
  keys: string[],
  options: { maxLength?: number } = {},
): string[] | null {
  const maxLength = options.maxLength ?? 24;
  if (keys.length < 2 || keys.every((k) => k.length <= maxLength)) {
    return null;
  }
  return positionsBetween(null, null, keys.length);
}

// ---------- Legacy 行的 Position 合成（REST 写 / 兜底共用） ----------

const MAX_TS = 4_102_444_800_000; // 2100-01-01，分数编码的值域上界
const FRACTION_WIDTH = 9;

const intKeyCache = new Map<number, string>();

function intToPositionKey(intValue: number): string {
  let key = intKeyCache.get(intValue);
  if (key === undefined) {
    const keys = positionsBetween(null, null, intValue + 1);
    key = keys[intValue];
    intKeyCache.set(intValue, key);
  }
  return key;
}

function toBase62(value: number): string {
  let digits = '';
  let rest = value;
  do {
    digits = BASE_62_DIGITS[rest % 62] + digits;
    rest = Math.floor(rest / 62);
  } while (rest > 0);
  return digits;
}

/**
 * 合成 Position：整数部分 = sortOrder，分数部分 = (MAX_TS - createdAt)
 * 的定宽 base62 + 非零哨兵（防尾零）。createdAt 越大排越前（REST 排序
 * 的 createdAt desc 语义）。纯函数，重复序列化结果稳定。
 *
 * 用于 legacy 行（REST 创建、position 为 null）的确定性合成——hub
 * 侧 wireViewOfRow 与 REST reorder 写 position 时共用同一实现，
 * 保证「写下的 position」与「未写时 hub 合成的 position」完全一致，
 * 两端排序口径不因写与不写而漂移。
 */
export function synthPosition(sortOrder: number, createdAt: Date): string {
  const descending = toBase62(Math.max(0, MAX_TS - createdAt.getTime()));
  return intToPositionKey(Math.max(0, sortOrder)) + descending.padStart(FRACTION_WIDTH, '0') + '1';
}
