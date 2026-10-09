import { createServer } from 'node:http';
import type { Request, Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { httpCompression } from '../src/common/http-compression';

function server(contentType: string, body: string) {
  const compress = httpCompression();
  return createServer((req, res) => {
    compress(req as Request, res as Response, () => {
      res.setHeader('Content-Type', contentType);
      res.end(body);
    });
  });
}

describe('HTTP response compression', () => {
  it('compresses large JSON snapshots without changing the response', async () => {
    const snapshot = Array.from({ length: 500 }, (_, id) => ({
      id,
      clocks: { title: '1700000000000:0:0', status: '1700000000000:0:0' },
    }));
    const response = await request(server('application/json', JSON.stringify(snapshot)))
      .get('/sync/bootstrap')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers.vary).toContain('Accept-Encoding');
    expect(response.body).toEqual(snapshot);
  });

  it('leaves event streams uncompressed so frames are not buffered', async () => {
    const body = `data: ${JSON.stringify({ type: 'change', data: 'x'.repeat(2000) })}\n\n`;
    const response = await request(server('text/event-stream; charset=utf-8', body))
      .get('/events')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.text).toBe(body);
  });

  it('supports clients that do not accept compressed responses', async () => {
    const payload = { title: 'x'.repeat(2000) };
    const response = await request(server('application/json', JSON.stringify(payload)))
      .get('/sync/bootstrap')
      .set('Accept-Encoding', 'identity')
      .expect(200);

    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.body).toEqual(payload);
  });
});
