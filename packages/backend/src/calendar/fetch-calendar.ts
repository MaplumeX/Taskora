import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

import type { CalendarFetchErrorCode } from '@taskora/shared';

/**
 * 拉取订阅的 ICS（ADR 0023）。URL 由用户提供、由 hub 发起请求，必须防
 * SSRF：只接受 http(s)，连接时校验解析出的 IP（在 socket 的 lookup 里校验，
 * DNS rebinding 也绕不过），每跳重定向重新校验；限时、限大小。
 */

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
export const MAX_CALENDAR_BYTES = 10 * 1024 * 1024;

export class CalendarFetchError extends Error {
  constructor(
    readonly code: CalendarFetchErrorCode,
    readonly status?: number,
  ) {
    super(status ? `${code}:${status}` : code);
  }

  /** 存储 / 线上形态：`http_error` 带状态码后缀。 */
  get storedCode(): string {
    return this.message;
  }
}

/** 自托管订阅内网日历时设 `CALENDAR_ALLOW_PRIVATE_NETWORK=true`。 */
function allowPrivateNetwork(): boolean {
  return process.env.CALENDAR_ALLOW_PRIVATE_NETWORK === 'true';
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** 回环 / 私网 / 链路本地 / 组播等不可作为订阅源的地址。 */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family !== 6) return true;
  // IPv4 映射地址（::ffff:10.0.0.1）按内嵌的 IPv4 判断
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  return blocked.check(address, 'ipv6');
}

/** 规范化订阅链接：webcal → https；只接受 http(s)。 */
export function normalizeCalendarUrl(input: string): URL {
  const trimmed = input.trim().replace(/^webcals?:\/\//i, 'https://');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CalendarFetchError('invalid_url');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CalendarFetchError('invalid_url');
  }
  if (url.username || url.password) throw new CalendarFetchError('invalid_url');
  return url;
}

class BlockedAddressError extends Error {}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, '', 0);
    if (!allowPrivateNetwork() && addresses.some((entry) => isBlockedAddress(entry.address))) {
      return callback(new BlockedAddressError(hostname), '', 0);
    }
    if (options.all) {
      (callback as unknown as (err: null, addresses: LookupAddress[]) => void)(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

/** 拉取 ICS 文本；失败抛 CalendarFetchError。 */
export async function fetchCalendarText(input: string | URL): Promise<string> {
  let url = typeof input === 'string' ? normalizeCalendarUrl(input) : input;
  const deadline = Date.now() + TIMEOUT_MS;
  for (let hop = 0; ; hop++) {
    const result = await requestOnce(url, deadline);
    if (result.kind === 'body') return result.text;
    if (hop >= MAX_REDIRECTS) throw new CalendarFetchError('unreachable');
    let next: URL;
    try {
      next = new URL(result.location, url);
    } catch {
      throw new CalendarFetchError('unreachable');
    }
    url = normalizeCalendarUrl(next.toString());
  }
}

type HopResult = { kind: 'body'; text: string } | { kind: 'redirect'; location: string };

function requestOnce(url: URL, deadline: number): Promise<HopResult> {
  // IP 字面量不经 lookup，直接校验
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && !allowPrivateNetwork() && isBlockedAddress(literal)) {
    return Promise.reject(new CalendarFetchError('blocked_address'));
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new CalendarFetchError('timeout'));

  return new Promise<HopResult>((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;
    const fail = (error: CalendarFetchError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.destroy();
      reject(error);
    };
    const request = client.get(
      url,
      {
        lookup: guardedLookup,
        headers: { Accept: 'text/calendar, */*;q=0.5', 'User-Agent': 'Taskora-Calendar/1.0' },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          settled = true;
          clearTimeout(timer);
          resolve({ kind: 'redirect', location: response.headers.location });
          return;
        }
        if (status !== 200) {
          response.resume();
          fail(new CalendarFetchError('http_error', status));
          return;
        }
        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > MAX_CALENDAR_BYTES) {
          fail(new CalendarFetchError('too_large'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_CALENDAR_BYTES) fail(new CalendarFetchError('too_large'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ kind: 'body', text: Buffer.concat(chunks).toString('utf8') });
        });
        response.on('error', () => fail(new CalendarFetchError('unreachable')));
      },
    );
    const timer = setTimeout(() => fail(new CalendarFetchError('timeout')), remaining);
    request.on('error', (error) => {
      fail(
        new CalendarFetchError(
          error instanceof BlockedAddressError || error.cause instanceof BlockedAddressError
            ? 'blocked_address'
            : 'unreachable',
        ),
      );
    });
  });
}
