import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { AgentConfigService } from '../../src/agent/byok/agent-config.service';
import { encryptSecret, maskApiKey } from '../../src/agent/byok/encryption';

const MASTER_KEY = '11'.repeat(32);

function createService() {
  const prisma = {
    agentConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const service = new AgentConfigService(prisma as never);
  return { service, prisma };
}

describe('AgentConfigService', () => {
  let ctx: ReturnType<typeof createService>;

  beforeEach(() => {
    process.env.AGENT_ENCRYPTION_KEY = MASTER_KEY;
    ctx = createService();
  });

  it('reports unconfigured when no row exists', async () => {
    ctx.prisma.agentConfig.findUnique.mockResolvedValue(null);
    const config = await ctx.service.getConfig('user-1');
    expect(config).toMatchObject({
      configured: false,
      provider: 'custom',
      baseUrl: null,
      modelId: null,
      apiKeyMasked: null,
    });
    expect(await ctx.service.resolveRuntimeConfig('user-1')).toBeNull();
  });

  it('masks the key on read and never returns the plaintext', async () => {
    ctx.prisma.agentConfig.findUnique.mockResolvedValue({
      userId: 'user-1',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      modelId: 'deepseek-chat',
      apiKeyEncrypted: encryptSecret('sk-real-key-9876', MASTER_KEY),
    });
    const config = await ctx.service.getConfig('user-1');
    expect(config.configured).toBe(true);
    expect(config.apiKeyMasked).toBe(maskApiKey('sk-real-key-9876'));
    expect(JSON.stringify(config)).not.toContain('sk-real-key');
  });

  it('resolveRuntimeConfig returns decrypted values', async () => {
    ctx.prisma.agentConfig.findUnique.mockResolvedValue({
      baseUrl: 'https://api.deepseek.com/v1/',
      modelId: 'deepseek-chat',
      apiKeyEncrypted: encryptSecret('sk-real-key-9876', MASTER_KEY),
    });
    const resolved = await ctx.service.resolveRuntimeConfig('user-1');
    expect(resolved).toEqual({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-real-key-9876',
      modelId: 'deepseek-chat',
    });
  });

  it('resolveRuntimeConfig degrades to null on a corrupted envelope', async () => {
    ctx.prisma.agentConfig.findUnique.mockResolvedValue({
      baseUrl: 'https://x',
      modelId: 'm',
      apiKeyEncrypted: 'v1:deadbeef:deadbeef:deadbeef',
    });
    expect(await ctx.service.resolveRuntimeConfig('user-1')).toBeNull();
  });

  it('updateConfig encrypts the key before storing', async () => {
    ctx.prisma.agentConfig.upsert.mockImplementation(async ({ create }) => ({
      provider: create.provider,
      baseUrl: create.baseUrl,
      modelId: create.modelId,
      apiKeyEncrypted: create.apiKeyEncrypted,
    }));
    await ctx.service.updateConfig('user-1', {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-my-key',
      modelId: 'deepseek-chat',
    });
    const stored = ctx.prisma.agentConfig.upsert.mock.calls[0][0].create;
    expect(stored.apiKeyEncrypted).not.toContain('sk-my-key');
    expect(stored.apiKeyEncrypted.startsWith('v1:')).toBe(true);
  });

  it('updateConfig rejects unknown provider presets', async () => {
    await expect(ctx.service.updateConfig('user-1', { provider: 'nope' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('testConnection reports unreachable endpoints without throwing', async () => {
    ctx.prisma.agentConfig.findUnique.mockResolvedValue(null);
    const result = await ctx.service.testConnection('user-1', {
      baseUrl: 'http://127.0.0.1:9/v1',
      apiKey: 'k',
    });
    expect(result.ok).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('testConnection flags a configured-but-absent model', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      Response.json({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
    );
    try {
      const ok = await ctx.service.testConnection('user-1', {
        baseUrl: 'https://api.example.com/v1/',
        apiKey: 'k',
        modelId: 'model-a',
      });
      expect(ok).toMatchObject({ ok: true, models: ['model-a', 'model-b'] });

      const missing = await ctx.service.testConnection('user-1', {
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'k',
        modelId: 'model-zzz',
      });
      expect(missing.ok).toBe(false);
      expect(missing.message).toContain('model-zzz');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
