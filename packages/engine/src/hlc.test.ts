import { HybridClock, compareHlc, formatHlc, parseHlc } from './hlc';

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
