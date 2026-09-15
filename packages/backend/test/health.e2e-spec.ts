import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { HealthController } from '../src/health/health.controller';

/**
 * Health probe e2e.
 *
 * Only HealthController is mounted, so this needs no database and is not
 * gated on TEST_DATABASE_URL. The global prefix is applied the same way as
 * `main.ts` because the exact path (`/api/v1/health`) is what the desktop
 * ServerSetup probe and the compose healthcheck depend on.
 */
describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers 200 with { status: "ok" } without authentication', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });
});
