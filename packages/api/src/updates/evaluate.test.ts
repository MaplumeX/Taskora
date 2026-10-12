import { describe, expect, it } from 'vitest';

import { compareVersions, evaluateUpdate, type LocalVersionInfo } from './evaluate';

const local: LocalVersionInfo = {
  appVersion: '0.9.0',
  protocolVersion: 7,
  minHubProtocolVersion: 7,
};
const hub = { status: 'ok', version: '0.9.0', protocolVersion: 7, minProtocolVersion: 7 };

describe('compareVersions', () => {
  it.each([
    ['0.9.0', '0.10.0', -1],
    ['1.0.0', '0.99.99', 1],
    ['0.9.0', '0.9.0', 0],
    ['v0.9.0', '0.9.0', 0],
    ['1.0.0-rc.1', '1.0.0', -1],
    ['1.0.0-rc.2', '1.0.0-rc.10', -1],
    ['1.0.0-alpha', '1.0.0-alpha.1', -1],
    ['1.0.0-rc.1', '0.9.0', 1],
  ])('%s vs %s → %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('无法解析的版本返回 null', () => {
    expect(compareVersions('unknown', '0.9.0')).toBeNull();
    expect(compareVersions('0.9.0', 'dev')).toBeNull();
  });
});

describe('evaluateUpdate（ADR-0026 判定表）', () => {
  it('同版本：up-to-date', () => {
    expect(evaluateUpdate(local, hub)).toEqual({ kind: 'up-to-date', hubVersion: '0.9.0' });
  });

  it('兼容且 hub 更新：update-available，目标是 hub 版本', () => {
    expect(evaluateUpdate(local, { ...hub, version: '0.10.0' })).toEqual({
      kind: 'update-available',
      hubVersion: '0.10.0',
    });
  });

  it('本机协议低于 hub 下限：client-too-old（不可跳过的必须更新）', () => {
    expect(
      evaluateUpdate(local, {
        ...hub,
        version: '1.0.0',
        protocolVersion: 8,
        minProtocolVersion: 8,
      }),
    ).toEqual({
      kind: 'client-too-old',
      hubVersion: '1.0.0',
    });
  });

  it('hub 协议低于本机认可的最低版本：hub-too-old，不降级', () => {
    expect(
      evaluateUpdate(local, {
        ...hub,
        version: '0.8.0',
        protocolVersion: 6,
        minProtocolVersion: 6,
      }),
    ).toEqual({ kind: 'hub-too-old', hubVersion: '0.8.0' });
  });

  it('本机比 hub 新但协议兼容：up-to-date，不提示', () => {
    expect(evaluateUpdate({ ...local, appVersion: '0.9.3' }, hub)).toEqual({
      kind: 'up-to-date',
      hubVersion: '0.9.0',
    });
  });

  it('预发布：hub 的正式版高于本机 rc', () => {
    expect(
      evaluateUpdate({ ...local, appVersion: '1.0.0-rc.1' }, { ...hub, version: '1.0.0' }).kind,
    ).toBe('update-available');
  });

  it('ADR-0026 之前的 hub（health 只有 status）：up-to-date，不报错', () => {
    expect(evaluateUpdate(local, { status: 'ok' })).toEqual({ kind: 'up-to-date' });
  });

  it('本机版本未知（dev / web）：不提示更新', () => {
    expect(
      evaluateUpdate({ ...local, appVersion: 'unknown' }, { ...hub, version: '0.10.0' }).kind,
    ).toBe('up-to-date');
  });

  it('client-too-old 优先于版本比较', () => {
    expect(
      evaluateUpdate(
        { ...local, appVersion: '2.0.0' },
        { ...hub, version: '1.0.0', minProtocolVersion: 8 },
      ).kind,
    ).toBe('client-too-old');
  });
});
