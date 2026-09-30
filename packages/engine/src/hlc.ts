/**
 * Hybrid Logical Clock（HLC，混合逻辑时钟）— 字段时间戳的取值机制。
 *
 * 见 CONTEXT.md「引擎与同步（local-first）」：墙上时钟 + 逻辑计数，兼顾
 * 可读性与因果序；每条变更另携设备 ID 作决胜。时间戳是零填充定宽字符串，
 * 因此字典序比较与 (wallMs, counter, deviceId) 数值比较完全一致。
 */

const WALL_WIDTH = 15; // 毫秒数零填充宽度（覆盖到公元 2286 年）
const COUNTER_WIDTH = 6; // 逻辑计数零填充宽度（999999 足够任何一次写爆发）

export interface HlcParts {
  wallMs: number;
  counter: number;
  deviceId: string;
}

/** 序列化为 `"<wall>:<counter>:<deviceId>"`，字典序即可比较。 */
export function formatHlc(parts: HlcParts): string {
  return `${String(parts.wallMs).padStart(WALL_WIDTH, '0')}:${String(parts.counter).padStart(COUNTER_WIDTH, '0')}:${parts.deviceId}`;
}

export function parseHlc(stamp: string): HlcParts {
  const [wall, counter, ...deviceId] = stamp.split(':');
  if (wall === undefined || counter === undefined || deviceId.length === 0) {
    throw new Error(`invalid HLC stamp: ${stamp}`);
  }
  return { wallMs: Number(wall), counter: Number(counter), deviceId: deviceId.join(':') };
}

/** 取时间戳的墙钟毫秒读数（合并器/hub 合成基线用）。 */
export function hlcWallMs(stamp: string): number {
  return Number(stamp.split(':', 1)[0]);
}

/** 比较两个时间戳：新者返回正数。可直接用字符串比较，等价。 */
export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 远端时间戳最多把本地时钟推到「校准后的当前时间 + 此值」。一台系统
 * 时钟超前的设备写下的时间戳在 LWW 里照常生效（不追溯修正），但不会
 * 把其他设备的时钟一并拖进未来。
 */
export const MAX_CLOCK_DRIFT_MS = 60 * 60 * 1000;

/**
 * 每设备一个的 HLC 实例：`now()` 发号，`receive()` 吸收远端时间戳。
 * 两者都推进本地时钟，保证同一设备发出的时间戳严格单调递增。
 *
 * 墙钟读数 = 系统时钟 + 校准偏移（setWallOffset，由 Engine 按 Sync Hub
 * 回报的服务器时间测得）。各设备因此以 hub 时间为共同基准，设备时间戳
 * 与 hub 以虚拟设备 0 合成的时钟（REST 写、清洗）可以公平比较。
 */
export class HybridClock {
  private lastWallMs = 0;
  private counter = 0;
  private offsetMs = 0;

  constructor(
    private readonly deviceId: string,
    /** 可注入的墙上时钟（测试确定性）。 */
    private readonly wallClock: () => number = () => Date.now(),
    private readonly maxDriftMs: number = MAX_CLOCK_DRIFT_MS,
  ) {}

  /** 未校准的系统时钟读数（测量校准偏移用）。 */
  rawWallMs(): number {
    return this.wallClock();
  }

  /** 设置校准偏移：此后墙钟读数 = 系统时钟 + offsetMs。 */
  setWallOffset(offsetMs: number): void {
    this.offsetMs = offsetMs;
  }

  getWallOffset(): number {
    return this.offsetMs;
  }

  private physicalNow(): number {
    return this.wallClock() + this.offsetMs;
  }

  /** 发出一个新的本地时间戳。 */
  now(): string {
    const wall = Math.max(this.lastWallMs, this.physicalNow());
    if (wall === this.lastWallMs) {
      this.counter += 1;
    } else {
      this.counter = 0;
    }
    this.lastWallMs = wall;
    return formatHlc({ wallMs: wall, counter: this.counter, deviceId: this.deviceId });
  }

  /**
   * 吸收一个远端时间戳并返回新的本地时间戳（本地时钟推进到不小于远端）。
   * 陈旧的远端时间戳不会把本地时钟拉回去。
   */
  receive(remote: string): string {
    const parsed = parseHlc(remote);
    const physical = this.physicalNow();
    // 超前过多的远端时间戳按上限吸收（不把本地时钟拖进未来）
    const ceiling = physical + this.maxDriftMs;
    const r = parsed.wallMs > ceiling ? { wallMs: ceiling, counter: 0 } : parsed;
    const wall = Math.max(this.lastWallMs, r.wallMs, physical);
    if (wall === this.lastWallMs && wall === r.wallMs) {
      this.counter = Math.max(this.counter, r.counter) + 1;
    } else if (wall === this.lastWallMs) {
      this.counter += 1;
    } else if (wall === r.wallMs) {
      this.counter = r.counter + 1;
    } else {
      this.counter = 0;
    }
    this.lastWallMs = wall;
    return formatHlc({ wallMs: wall, counter: this.counter, deviceId: this.deviceId });
  }

  /** 当前（未发号）时间戳的墙钟读数，仅用于快照合成基线。 */
  currentWallMs(): number {
    return Math.max(this.lastWallMs, this.physicalNow());
  }

  /** 内部状态快照（跨会话持久化，防止重启后时间戳回退/重复）。 */
  getState(): { wallMs: number; counter: number } {
    return { wallMs: this.lastWallMs, counter: this.counter };
  }

  /** 从持久化状态恢复（仅 init 时调用）。 */
  restoreState(state: { wallMs: number; counter: number }): void {
    this.lastWallMs = Math.max(this.lastWallMs, state.wallMs);
    this.counter = state.wallMs === this.lastWallMs ? state.counter : 0;
  }
}
