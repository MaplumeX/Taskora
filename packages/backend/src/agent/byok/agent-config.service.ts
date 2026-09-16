import { Injectable, BadRequestException } from '@nestjs/common';
import type { AgentConfig } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  AGENT_PROVIDER_PRESETS,
  AGENT_THINKING_LEVELS,
  type AgentConfigResponseDto,
  type AgentConfigTestResultDto,
  type AgentModelsResponseDto,
  type AgentThinkingLevel,
  type UpdateAgentConfigDto,
} from '@taskora/shared';
import { decryptSecret, encryptSecret, maskApiKey, requireMasterKey } from './encryption';

export interface ResolvedAgentConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  thinkingLevel: AgentThinkingLevel;
}

/** How long a connectivity probe may take before we give up. */
const TEST_TIMEOUT_MS = 10_000;
/** Never echo more model ids than this to keep responses small. */
const TEST_MAX_MODELS = 50;

@Injectable()
export class AgentConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stored config as the settings page sees it (masked key). */
  async getConfig(userId: string): Promise<AgentConfigResponseDto> {
    const config = await this.prisma.agentConfig.findUnique({
      where: { userId },
    });
    return this.toResponse(config);
  }

  /**
   * Resolve the decrypted runtime config for building an Agent.
   * Returns null when the user has not completed BYOK setup.
   */
  async resolveRuntimeConfig(userId: string): Promise<ResolvedAgentConfig | null> {
    const config = await this.prisma.agentConfig.findUnique({
      where: { userId },
    });
    if (!config) return null;
    if (!config.baseUrl || !config.modelId || !config.apiKeyEncrypted) return null;
    try {
      const apiKey = decryptSecret(config.apiKeyEncrypted, requireMasterKey());
      if (!apiKey) return null;
      return {
        baseUrl: normalizeBaseUrl(config.baseUrl),
        apiKey,
        modelId: config.modelId,
        thinkingLevel: isThinkingLevel(config.thinkingLevel) ? config.thinkingLevel : 'off',
      };
    } catch {
      // Corrupted envelope or rotated master key: treat as unconfigured.
      return null;
    }
  }

  async updateConfig(userId: string, dto: UpdateAgentConfigDto): Promise<AgentConfigResponseDto> {
    const data: {
      provider?: string;
      baseUrl?: string | null;
      modelId?: string | null;
      apiKeyEncrypted?: string | null;
      thinkingLevel?: AgentThinkingLevel;
    } = {};

    if (dto.provider !== undefined) {
      if (!AGENT_PROVIDER_PRESETS.some((p) => p.id === dto.provider)) {
        throw new BadRequestException(`Unknown provider preset: ${dto.provider}`);
      }
      data.provider = dto.provider;
    }
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl.trim() || null;
    if (dto.modelId !== undefined) data.modelId = dto.modelId.trim() || null;
    if (dto.thinkingLevel !== undefined) data.thinkingLevel = dto.thinkingLevel;
    if (dto.apiKey !== undefined) {
      const trimmed = dto.apiKey.trim();
      data.apiKeyEncrypted = trimmed ? encryptSecret(trimmed, requireMasterKey()) : null;
    }

    const config = await this.prisma.agentConfig.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.toResponse(config);
  }

  /**
   * Probe an OpenAI-compatible endpoint. Probes the stored config unless the
   * request carries draft values (so the settings page can test before save).
   */
  async testConnection(
    userId: string,
    draft: { baseUrl?: string; apiKey?: string; modelId?: string },
  ): Promise<AgentConfigTestResultDto> {
    let baseUrl = draft.baseUrl?.trim();
    let apiKey = draft.apiKey?.trim();
    const modelId = draft.modelId?.trim();

    if (!baseUrl || !apiKey) {
      const stored = await this.resolveRuntimeConfig(userId);
      if (!stored) {
        return {
          ok: false,
          message: 'No complete configuration to test. Fill in base URL, API key and model ID.',
          models: [],
        };
      }
      baseUrl = baseUrl || stored.baseUrl;
      apiKey = apiKey || stored.apiKey;
    }

    baseUrl = normalizeBaseUrl(baseUrl);
    try {
      const models = await this.fetchModelList(baseUrl, apiKey);
      const modelKnown = !modelId || models.length === 0 || models.includes(modelId);
      return {
        ok: modelKnown,
        message: modelKnown
          ? `Endpoint reachable (${models.length} models listed).`
          : `Endpoint reachable, but model "${modelId}" was not found in its model list.`,
        models,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Could not reach endpoint: ${(error as Error).message}`,
        models: [],
      };
    }
  }

  /** List model ids on the configured endpoint (composer model picker). */
  async listModels(userId: string): Promise<AgentModelsResponseDto> {
    const stored = await this.resolveRuntimeConfig(userId);
    if (!stored) {
      throw new BadRequestException(
        'No complete configuration. Fill in base URL, API key and model ID first.',
      );
    }
    return { models: await this.fetchModelList(stored.baseUrl, stored.apiKey) };
  }

  /** Fetch `${baseUrl}/models` with a timeout; throws on HTTP/network errors. */
  private async fetchModelList(baseUrl: string, apiKey: string): Promise<string[]> {
    const url = new URL(`${baseUrl}/models`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Endpoint responded with HTTP ${res.status}`);
      }
      const payload = (await res.json()) as { data?: Array<{ id?: string }> };
      return Array.isArray(payload.data)
        ? payload.data
            .map((m) => m.id)
            .filter((id): id is string => typeof id === 'string')
            .slice(0, TEST_MAX_MODELS)
        : [];
    } finally {
      clearTimeout(timer);
    }
  }

  private toResponse(config: AgentConfig | null): AgentConfigResponseDto {
    const baseUrl = config?.baseUrl ?? null;
    const modelId = config?.modelId ?? null;
    let apiKeyMasked: string | null = null;
    if (config?.apiKeyEncrypted) {
      try {
        apiKeyMasked = maskApiKey(decryptSecret(config.apiKeyEncrypted, requireMasterKey()));
      } catch {
        apiKeyMasked = '••••';
      }
    }
    return {
      configured: Boolean(baseUrl && modelId && config?.apiKeyEncrypted),
      provider: config?.provider ?? 'custom',
      baseUrl,
      modelId,
      apiKeyMasked,
      thinkingLevel: isThinkingLevel(config?.thinkingLevel) ? config.thinkingLevel : 'off',
    };
  }
}

function isThinkingLevel(value: string | null | undefined): value is AgentThinkingLevel {
  return (AGENT_THINKING_LEVELS as readonly string[]).includes(value ?? '');
}

/** Strip a trailing slash so `${baseUrl}/models` always joins cleanly. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
