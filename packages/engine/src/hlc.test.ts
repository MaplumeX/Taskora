import { compareHlc, formatHlc, HybridClock, MAX_CLOCK_DRIFT_MS, parseHlc } from './hlc';

describe('HybridClock', () => {
  it('在同一毫秒内发出的时间戳严格递增（逻辑计数推进）', () => {
    const clock = new HybridClock('device-a', () => 1_000);
    const first = clock.now();
    const second = clock.now();
    const third = clock.now();
    expect(compareHlc(first, second)).toBe(-1);
    expect(compareHlc(second, third)).toBe(-1);
    expect(parseHlc(third).counter).toBe(2);
  });

  it('墙上时钟回拨时不后退（沿用上次墙钟 + 计数推进）', () => {
    let t = 2_500;
    const clock = new HybridClock('device-a', () => (t -= 500)); // 2000, 1500, 1000 …
    const first = clock.now();
    const second = clock.now();
    expect(parseHlc(second).wallMs).toBe(2_000);
    expect(compareHlc(first, second)).toBe(-1);
  });

  it('receive 吸收更新的远端时间戳后，本地下一个时间戳大于远端', () => {
    const clock = new HybridClock('device-a', () => 1_000);
    const remote = formatHlc({ wallMs: 5_000, counter: 7, deviceId: 'device-b' });
    const local = clock.receive(remote);
    expect(compareHlc(local, remote)).toBe(1);
    // 后续本地发号继续单调
    expect(compareHlc(local, clock.now())).toBe(-1);
  });

  it('receive 陈旧远端时间戳不拉低本地时钟', () => {
    const clock = new HybridClock('device-a', () => 10_000);
    clock.now(); // 本地已到 10000
    const stale = formatHlc({ wallMs: 1_000, counter: 99, deviceId: 'device-b' });
    const local = clock.receive(stale);
    expect(parseHlc(local).wallMs).toBe(10_000);
    expect(compareHlc(local, stale)).toBe(1);
  });

  it('同墙钟同计数时按设备 ID 决胜（字典序），且字符串比较与解析比较一致', () => {
    const a = formatHlc({ wallMs: 1_000, counter: 1, deviceId: 'device-a' });
    const b = formatHlc({ wallMs: 1_000, counter: 1, deviceId: 'device-b' });
    expect(compareHlc(a, b)).toBe(-1);
    expect(a < b).toBe(true); // 字典序直接可比
  });

  it('时间戳定宽填充保证字典序 = (wall, counter, deviceId) 数值序', () => {
    const stamps = [
      formatHlc({ wallMs: 9, counter: 99, deviceId: 'd' }),
      formatHlc({ wallMs: 10, counter: 0, deviceId: 'd' }),
      formatHlc({ wallMs: 10, counter: 9, deviceId: 'd' }),
      formatHlc({ wallMs: 10, counter: 10, deviceId: 'd' }),
      formatHlc({ wallMs: 10, counter: 10, deviceId: 'e' }),
      formatHlc({ wallMs: 999_999_999_999_999, counter: 0, deviceId: 'z' }),
    ];
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i - 1] < stamps[i]).toBe(true);
    }
  });
});

describe('HybridClock 校准与漂移上限', () => {
  it('setWallOffset 把墙钟读数平移到 hub 时间', () => {
    const clock = new HybridClock('dev', () => 10_000);
    clock.setWallOffset(-4_000);
    expect(parseHlc(clock.now()).wallMs).toBe(6_000);
  });

  it('超前过多的远端时间戳按上限吸收，不把本地时钟拖进未来', () => {
    const clock = new HybridClock('dev', () => 10_000);
    const future = formatHlc({
      wallMs: 10_000 + 10 * MAX_CLOCK_DRIFT_MS,
      counter: 5,
      deviceId: 'x',
    });
    const absorbed = parseHlc(clock.receive(future));
    expect(absorbed.wallMs).toBe(10_000 + MAX_CLOCK_DRIFT_MS);
    // 上限之内的远端时间戳照常吸收
    const near = formatHlc({ wallMs: 10_000 + MAX_CLOCK_DRIFT_MS + 0, counter: 9, deviceId: 'x' });
    expect(parseHlc(clock.receive(near)).counter).toBe(10);
  });
});

describe('小数墙钟（旧版校准偏移带 .5）', () => {
  const legacy = '1790857242098.5:000000:dev';
  const later = formatHlc({ wallMs: 1_790_857_243_000, counter: 0, deviceId: 'dev' });

  it('校准偏移取整：发出的时间戳都是定宽整数墙钟', () => {
    const clock = new HybridClock('dev', () => 1_790_857_242_000);
    clock.setWallOffset(98.5);
    const stamp = clock.now();
    expect(stamp).toMatch(/^\d{15}:/);
    expect(parseHlc(stamp).wallMs).toBe(1_790_857_242_099);
  });

  it('compareHlc 按数值裁决：旧版小数时间戳不再压过之后的整数时间戳', () => {
    expect(legacy > later).toBe(true); // 字典序：错误
    expect(compareHlc(legacy, later)).toBe(-1);
    expect(compareHlc(later, legacy)).toBe(1);
    expect(compareHlc(legacy, legacy)).toBe(0);
  });

  it('formatHlc 向上取整；吸收与恢复小数墙钟后继续发出规范时间戳', () => {
    expect(formatHlc({ wallMs: 10.5, counter: 0, deviceId: 'd' })).toBe('000000000000011:000000:d');
    const clock = new HybridClock('dev', () => 1_000);
    clock.restoreState({ wallMs: 1_790_857_242_098.5, counter: 0 });
    const restored = clock.now();
    expect(restored).toMatch(/^\d{15}:/);
    expect(compareHlc(restored, legacy)).toBe(1);
    const near = new HybridClock('dev', () => 1_790_857_249_000);
    const received = near.receive('1790857250000.5:000003:x');
    expect(received).toMatch(/^\d{15}:/);
    expect(compareHlc(received, '1790857250000.5:000003:x')).toBe(1);
  });
});
