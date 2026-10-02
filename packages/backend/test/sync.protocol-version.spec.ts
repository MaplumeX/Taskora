import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { SYNC_PROTOCOL_VERSION } from '@taskora/engine';

import { MIN_SYNC_PROTOCOL_VERSION, assertSyncProtocol } from '../src/sync/sync.controller';

/** 同步协议版本（local-first-v3 issue 03，ADR-0007「协议版本」）。 */
describe('assertSyncProtocol', () => {
  it('最低版本 4（retire-sort-order）：协议 3 与不带版本头的旧客户端得到 426', () => {
    expect(MIN_SYNC_PROTOCOL_VERSION).toBe(4);
    expect(() => assertSyncProtocol(undefined)).toThrow(HttpException);
    expect(() => assertSyncProtocol('3')).toThrow(HttpException);
    expect(() => assertSyncProtocol('garbage')).toThrow(HttpException);
  });

  it('解析版本头；比 hub 新的版本照常接受（按能力降级）', () => {
    expect(assertSyncProtocol(String(SYNC_PROTOCOL_VERSION))).toBe(SYNC_PROTOCOL_VERSION);
    expect(assertSyncProtocol(String(SYNC_PROTOCOL_VERSION + 5))).toBe(SYNC_PROTOCOL_VERSION + 5);
    expect(assertSyncProtocol(undefined, 0)).toBe(0);
  });

  it('低于最低版本：HTTP 426，响应体带最低版本', () => {
    let error: unknown;
    try {
      assertSyncProtocol('1', 2);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HttpException);
    const http = error as HttpException;
    expect(http.getStatus()).toBe(426);
    expect(http.getResponse()).toMatchObject({
      minProtocolVersion: 2,
      protocolVersion: SYNC_PROTOCOL_VERSION,
    });
  });
});
