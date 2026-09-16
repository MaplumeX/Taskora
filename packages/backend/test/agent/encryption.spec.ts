import { describe, expect, it } from 'vitest';

import {
  DecryptionError,
  decryptSecret,
  encryptSecret,
  maskApiKey,
  requireMasterKey,
} from '../../src/agent/byok/encryption';

const MASTER_KEY = '0f'.repeat(32); // 64 hex chars

describe('encryption', () => {
  it('round-trips a secret', () => {
    const envelope = encryptSecret('sk-secret-1234', MASTER_KEY);
    expect(envelope.startsWith('v1:')).toBe(true);
    expect(envelope).not.toContain('sk-secret');
    expect(decryptSecret(envelope, MASTER_KEY)).toBe('sk-secret-1234');
  });

  it('produces a different envelope per call (random IV)', () => {
    const a = encryptSecret('same', MASTER_KEY);
    const b = encryptSecret('same', MASTER_KEY);
    expect(a).not.toBe(b);
  });

  it('rejects a wrong master key', () => {
    const envelope = encryptSecret('sk-secret', MASTER_KEY);
    expect(() => decryptSecret(envelope, 'ff'.repeat(32))).toThrow(DecryptionError);
  });

  it('rejects malformed envelopes', () => {
    expect(() => decryptSecret('v2:aa:bb:cc', MASTER_KEY)).toThrow(DecryptionError);
    expect(() => decryptSecret('not-an-envelope', MASTER_KEY)).toThrow(DecryptionError);
    // Tampered ciphertext fails the GCM auth tag check.
    const envelope = encryptSecret('sk-secret', MASTER_KEY);
    const parts = envelope.split(':');
    parts[3] = (parts[3].slice(0, -2) || '00') + (parts[3].endsWith('00') ? '11' : '00');
    expect(() => decryptSecret(parts.join(':'), MASTER_KEY)).toThrow(DecryptionError);
  });

  it('masks api keys keeping the last 4 chars only', () => {
    expect(maskApiKey('sk-abcdefgh1234')).toBe('••••1234');
    expect(maskApiKey('abcd')).toBe('••••');
    expect(maskApiKey('abc')).toBe('••••');
  });

  it('requires a master key from argument or env', () => {
    expect(() => requireMasterKey(undefined)).toThrow(/AGENT_ENCRYPTION_KEY/);
    const prev = process.env.AGENT_ENCRYPTION_KEY;
    process.env.AGENT_ENCRYPTION_KEY = '  ';
    try {
      expect(() => requireMasterKey(undefined)).toThrow(/AGENT_ENCRYPTION_KEY/);
      process.env.AGENT_ENCRYPTION_KEY = MASTER_KEY;
      expect(requireMasterKey(undefined)).toBe(MASTER_KEY);
    } finally {
      if (prev === undefined) delete process.env.AGENT_ENCRYPTION_KEY;
      else process.env.AGENT_ENCRYPTION_KEY = prev;
    }
  });
});
