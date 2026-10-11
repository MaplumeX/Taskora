/**
 * 客户端更新判定（ADR-0025）：更新目标是所连 Sync Hub 的版本，兼容范围按
 * 同步协议版本判定。纯函数，桌面端与 Android 共用。
 */

/** hub 的 `GET /health` 响应；ADR-0025 之前的 hub 只有 status。 */
export interface HubHealth {
  status?: string;
  version?: string;
  protocolVersion?: number;
  minProtocolVersion?: number;
}

export interface LocalVersionInfo {
  appVersion: string;
  /** 本端实现的同步协议（SYNC_PROTOCOL_VERSION）。 */
  protocolVersion: number;
  /** 本端认可的最低 hub 协议（MIN_HUB_PROTOCOL_VERSION）。 */
  minHubProtocolVersion: number;
}

/**
 * - client-too-old：本端协议低于 hub 下限，同步已停，必须更新（不可跳过）。
 * - hub-too-old：hub 协议低于本端要求，提示升级服务器；客户端不降级。
 * - update-available：兼容，hub 版本更高，可选更新。
 * - up-to-date：其余情况（含本端比 hub 新但协议兼容、版本无法比较）。
 */
export type UpdateVerdict =
  | { kind: 'client-too-old'; hubVersion?: string }
  | { kind: 'hub-too-old'; hubVersion?: string }
  | { kind: 'update-available'; hubVersion: string }
  | { kind: 'up-to-date'; hubVersion?: string };

interface ParsedVersion {
  core: [number, number, number];
  pre: string[];
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(raw: string): ParsedVersion | null {
  const match = SEMVER.exec(raw.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const numA = /^\d+$/.test(a);
  const numB = /^\d+$/.test(b);
  if (numA && numB) return Math.sign(Number(a) - Number(b));
  if (numA !== numB) return numA ? -1 : 1; // 数字标识低于字母标识
  return a < b ? -1 : a > b ? 1 : 0;
}

/** semver 比较（含预发布后缀）；任一方无法解析时返回 null。 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] < right.core[i] ? -1 : 1;
  }
  // 有预发布后缀的低于正式版
  if (left.pre.length === 0 || right.pre.length === 0) {
    return left.pre.length === right.pre.length ? 0 : left.pre.length === 0 ? 1 : -1;
  }
  for (let i = 0; i < Math.min(left.pre.length, right.pre.length); i++) {
    const order = compareIdentifiers(left.pre[i], right.pre[i]);
    if (order !== 0) return order as -1 | 1;
  }
  return Math.sign(left.pre.length - right.pre.length) as -1 | 0 | 1;
}

export function evaluateUpdate(local: LocalVersionInfo, hub: HubHealth): UpdateVerdict {
  const hubVersion = typeof hub.version === 'string' ? hub.version : undefined;
  const version = hubVersion ? { hubVersion } : {};
  if (
    typeof hub.minProtocolVersion === 'number' &&
    hub.minProtocolVersion > local.protocolVersion
  ) {
    return { kind: 'client-too-old', ...version };
  }
  if (
    typeof hub.protocolVersion === 'number' &&
    hub.protocolVersion < local.minHubProtocolVersion
  ) {
    return { kind: 'hub-too-old', ...version };
  }
  if (hubVersion && compareVersions(local.appVersion, hubVersion) === -1) {
    return { kind: 'update-available', hubVersion };
  }
  return { kind: 'up-to-date', ...version };
}
