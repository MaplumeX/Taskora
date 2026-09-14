import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@taskora/ui/components/ui/button';
import { Input } from '@taskora/ui/components/ui/input';
import { Label } from '@taskora/ui/components/ui/label';
import { useServerSettings, parseServerUrl } from '@/server-settings';

/**
 * First-run / pre-login server configuration screen.
 * Points the client at a self-hosted Taskora deployment (`/api/v1`).
 */
export function ServerSetup() {
  const { t } = useTranslation('settings');
  const serverUrl = useServerSettings((s) => s.serverUrl);
  const setServerUrl = useServerSettings((s) => s.setServerUrl);
  const [input, setInput] = useState(serverUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Re-validate whenever the input changes after an error was shown.
  useEffect(() => {
    if (error) setError(null);
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = parseServerUrl(input);
    if (!normalized) {
      setError(t('serverUrlInvalid', { defaultValue: 'Invalid server address' }));
      return;
    }
    setChecking(true);
    try {
      // Probe the server before saving: a GET on /health (or any endpoint)
      // that answers with HTTP is enough to prove reachability.
      await fetch(`${normalized}/health`, { method: 'GET' }).catch(() => {
        throw new Error('unreachable');
      });
      setServerUrl(normalized);
      // The App re-renders onto the login view via the serverUrl change.
    } catch {
      setError(t('serverUnreachable', { defaultValue: 'Cannot reach this server' }));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-secondary/40 px-4 noise-overlay">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8 shadow-lift">
        <h1 className="mb-1 text-center font-display text-3xl font-semibold tracking-tight">
          Taskora
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          {t('serverSetupSubtitle', {
            defaultValue: 'Connect to your self-hosted Taskora server',
          })}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="server-url">
              {t('serverUrl', { defaultValue: 'Server address' })}
            </Label>
            <Input
              id="server-url"
              type="text"
              placeholder="https://taskora.example.com/api/v1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              {t('serverUrlHint', {
                defaultValue: 'The API base URL, including /api/v1',
              })}
            </p>
          </div>
          <Button type="submit" disabled={checking}>
            {checking
              ? t('serverChecking', { defaultValue: 'Connecting…' })
              : t('serverConnect', { defaultValue: 'Connect' })}
          </Button>
        </form>
      </div>
    </div>
  );
}
