import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdatePreferencesDto, UpdateProfileDto } from '../src/users/dto/users.dto';

/**
 * DTO-level validation tests (no DB required).
 *
 * Covers PRD acceptance: illegal avatarUrl must be rejected
 * at the validation boundary (class-validator in the global ValidationPipe).
 */
describe('UpdateProfileDto validation', () => {
  async function validateDto(payload: Record<string, unknown>) {
    const dto = plainToInstance(UpdateProfileDto, payload);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return errors.map((e) => e.property);
  }

  it('accepts a valid profile update', async () => {
    const errors = await validateDto({
      displayName: 'Alice',
      avatarUrl: 'https://example.com/a.png',
    });
    expect(errors).toEqual([]);
  });

  it('accepts null to clear fields', async () => {
    const errors = await validateDto({
      displayName: null,
      avatarUrl: null,
    });
    expect(errors).toEqual([]);
  });

  it('rejects a non-https avatarUrl', async () => {
    const errors = await validateDto({ avatarUrl: 'http://example.com/a.png' });
    expect(errors).toContain('avatarUrl');
  });

  it('rejects non-whitelisted fields', async () => {
    const errors = await validateDto({ role: 'admin' });
    expect(errors).toContain('role');
  });

  it('rejects an over-long displayName', async () => {
    const errors = await validateDto({ displayName: 'x'.repeat(65) });
    expect(errors).toContain('displayName');
  });
});

describe('UpdatePreferencesDto defaultReviewInterval validation', () => {
  async function validateDto(payload: Record<string, unknown>) {
    const dto = plainToInstance(UpdatePreferencesDto, payload);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return errors.map((e) => e.property);
  }

  it('accepts N × day / week / month / year with N ≥ 1', async () => {
    for (const unit of ['day', 'week', 'month', 'year']) {
      expect(await validateDto({ defaultReviewInterval: { unit, count: 2 } })).toEqual([]);
    }
  });

  it('rejects unknown units and non-positive or fractional counts', async () => {
    for (const interval of [
      { unit: 'decade', count: 1 },
      { unit: 'week', count: 0 },
      { unit: 'week', count: 1.5 },
      { unit: 'week' },
      'weekly',
    ]) {
      expect(await validateDto({ defaultReviewInterval: interval })).toEqual([
        'defaultReviewInterval',
      ]);
    }
  });
});
