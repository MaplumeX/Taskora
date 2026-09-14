import { describe, expect, it } from 'vitest';

import { parseServerUrl } from './server-settings';

describe('parseServerUrl', () => {
  it('accepts a full https URL', () => {
    expect(parseServerUrl('https://taskora.example.com/api/v1')).toBe(
      'https://taskora.example.com/api/v1',
    );
  });

  it('adds the http scheme when missing', () => {
    expect(parseServerUrl('192.168.1.10:3000/api/v1')).toBe(
      'http://192.168.1.10:3000/api/v1',
    );
  });

  it('strips trailing slashes', () => {
    expect(parseServerUrl('https://example.com/api/v1///')).toBe(
      'https://example.com/api/v1',
    );
  });

  it('returns null for empty input', () => {
    expect(parseServerUrl('')).toBeNull();
    expect(parseServerUrl('   ')).toBeNull();
  });

  it('returns null for non-http(s) schemes', () => {
    expect(parseServerUrl('ftp://example.com')).toBeNull();
    expect(parseServerUrl('file:///etc/passwd')).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseServerUrl('not a url ://')).toBeNull();
  });
});
