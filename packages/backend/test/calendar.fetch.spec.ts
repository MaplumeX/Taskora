import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  CalendarFetchError,
  fetchCalendarText,
  isBlockedAddress,
  normalizeCalendarUrl,
} from '../src/calendar/fetch-calendar';

describe('normalizeCalendarUrl', () => {
  it('maps webcal to https and keeps http(s)', () => {
    expect(normalizeCalendarUrl('webcal://example.com/a.ics').toString()).toBe(
      'https://example.com/a.ics',
    );
    expect(normalizeCalendarUrl(' http://example.com/a.ics ').protocol).toBe('http:');
  });

  it('rejects other schemes, credentials and garbage', () => {
    for (const input of [
      'file:///etc/passwd',
      'ftp://example.com',
      'https://u:p@example.com',
      'nope',
    ]) {
      expect(() => normalizeCalendarUrl(input)).toThrow(CalendarFetchError);
    }
  });
});

describe('isBlockedAddress', () => {
  it('blocks loopback, private, link-local and mapped addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });
});

describe('fetchCalendarText', () => {
  let server: Server;
  let base: string;
  const previous = process.env.CALENDAR_ALLOW_PRIVATE_NETWORK;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/cal.ics') {
        res.writeHead(200, { 'Content-Type': 'text/calendar' });
        res.end('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
      } else if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/cal.ics' });
        res.end();
      } else if (req.url === '/loop') {
        res.writeHead(302, { Location: '/loop' });
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CALENDAR_ALLOW_PRIVATE_NETWORK;
    else process.env.CALENDAR_ALLOW_PRIVATE_NETWORK = previous;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function code(url: string) {
    try {
      await fetchCalendarText(url);
      return 'ok';
    } catch (error) {
      return (error as CalendarFetchError).storedCode;
    }
  }

  it('refuses private addresses by default, by literal and by name', async () => {
    delete process.env.CALENDAR_ALLOW_PRIVATE_NETWORK;
    expect(await code(`${base}/cal.ics`)).toBe('blocked_address');
    const port = new URL(base).port;
    expect(await code(`http://localhost:${port}/cal.ics`)).toBe('blocked_address');
  });

  it('fetches, follows redirects and reports HTTP errors when private hosts are allowed', async () => {
    process.env.CALENDAR_ALLOW_PRIVATE_NETWORK = 'true';
    expect(await fetchCalendarText(`${base}/cal.ics`)).toContain('BEGIN:VCALENDAR');
    expect(await fetchCalendarText(`${base}/redirect`)).toContain('BEGIN:VCALENDAR');
    const port = new URL(base).port;
    expect(await fetchCalendarText(`http://localhost:${port}/cal.ics`)).toContain(
      'BEGIN:VCALENDAR',
    );
    expect(await code(`${base}/missing`)).toBe('http_error:404');
    expect(await code(`${base}/loop`)).toBe('unreachable');
  });
});
