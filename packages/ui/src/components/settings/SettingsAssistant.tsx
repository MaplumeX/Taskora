import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AGENT_PROVIDER_PRESETS,
  AGENT_THINKING_LEVELS,
  type AgentConfigTestResultDto,
  type AgentThinkingLevel,
} from '@taskora/shared';
import { useAgentConfig, useTestAgentConfig, useUpdateAgentConfig } from '@taskora/api';

/**
 * BYOK settings for the Assistant: provider preset + base URL + API key +
 * model id. The key is stored encrypted server-side (AES-256-GCM) and never
 * echoed back — only a masked preview.
 */
export default function SettingsAssistant() {
  const { t } = useTranslation(['settings', 'common', 'agent']);
  const { data: config, isLoading } = useAgentConfig();
  const update = useUpdateAgentConfig();
  const test = useTestAgentConfig();

  const [provider, setProvider] = useState('custom');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<AgentThinkingLevel>('off');
  const [testResult, setTestResult] = useState<AgentConfigTestResultDto | null>(null);

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setBaseUrl(config.baseUrl ?? '');
      setModelId(config.modelId ?? '');
      setThinkingLevel(config.thinkingLevel);
    }
  }, [config]);

  const applyPreset = (presetId: string) => {
    const preset = AGENT_PROVIDER_PRESETS.find((p) => p.id === presetId);
    setProvider(presetId);
    if (!preset) return;
    if (preset.baseUrl) setBaseUrl(preset.baseUrl);
    if (preset.suggestedModelId) setModelId(preset.suggestedModelId);
    setTestResult(null);
  };

  const handleSave = () => {
    setTestResult(null);
    update.mutate(
      {
        provider,
        baseUrl: baseUrl.trim(),
        modelId: modelId.trim(),
        thinkingLevel,
        // Omit the key entirely when untouched so the stored one is kept.
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      },
      {
        onSuccess: () => {
          setApiKey('');
          toast.success(t('settings:assistantSaved'));
        },
        onError: () => toast.error(t('settings:assistantSaveFailed')),
      },
    );
  };

  const handleTest = () => {
    setTestResult(null);
    test.mutate(
      {
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(modelId.trim() ? { modelId: modelId.trim() } : {}),
      },
      {
        onSuccess: (result) => {
          setTestResult(result);
          if (result.ok) toast.success(t('settings:assistantTestOk'));
          else toast.error(t('settings:assistantTestFailed'), { description: result.message });
        },
        onError: () => toast.error(t('settings:assistantTestFailed')),
      },
    );
  };

  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-1.5">
        <h2 className="font-display text-lg font-semibold">{t('settings:assistantSettings')}</h2>
        <p className="text-sm text-muted-foreground">
          {config.configured
            ? `${t('settings:assistantConfigured')}${config.apiKeyMasked ? ` · ${config.apiKeyMasked}` : ''}`
            : t('settings:assistantNotConfigured')}
        </p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="agent-provider">{t('settings:assistantProvider')}</Label>
        <div className="flex flex-wrap gap-1.5">
          {AGENT_PROVIDER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              className={
                provider === preset.id
                  ? 'border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                  : undefined
              }
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="agent-base-url">{t('settings:assistantBaseUrl')}</Label>
        <Input
          id="agent-base-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.deepseek.com/v1"
        />
        <p className="text-xs text-muted-foreground">{t('settings:assistantBaseUrlHint')}</p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="agent-api-key">{t('settings:assistantApiKey')}</Label>
        <Input
          id="agent-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config.apiKeyMasked ?? 'sk-…'}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">{t('settings:assistantApiKeyHint')}</p>
      </section>

      <section className="space-y-2">
        <Label htmlFor="agent-model">{t('settings:assistantModelId')}</Label>
        <Input
          id="agent-model"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="deepseek-chat"
        />
        <p className="text-xs text-muted-foreground">{t('settings:assistantModelIdHint')}</p>
      </section>

      <section className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div className="space-y-1">
          <Label htmlFor="agent-thinking">{t('settings:assistantThinking')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings:assistantThinkingHint')}</p>
        </div>
        <div
          role="radiogroup"
          aria-label={t('settings:assistantThinking')}
          className="flex shrink-0 gap-1 rounded-full border border-border bg-background p-1"
        >
          {AGENT_THINKING_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={thinkingLevel === level}
              onClick={() => setThinkingLevel(level)}
              className={
                thinkingLevel === level
                  ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
              }
            >
              {t(`agent:thinkingLevel_${level}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? t('settings:assistantSaving') : t('settings:assistantSave')}
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={test.isPending}>
          {test.isPending ? t('settings:assistantTesting') : t('settings:assistantTest')}
        </Button>
        {testResult ? (
          <span
            className={testResult.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}
          >
            {testResult.message}
          </span>
        ) : null}
      </section>
    </div>
  );
}
