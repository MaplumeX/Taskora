import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@taskora/ui/components/ui/button';
import { Input } from '@taskora/ui/components/ui/input';
import { Label } from '@taskora/ui/components/ui/label';
import { useLogin, i18n } from '@taskora/api';

/**
 * Desktop login screen — same JWT flow as web, but the token is persisted
 * through the native secure storage (via the injected TokenStore in @taskora/api).
 */
export function Login({ onBack }: { onBack: () => Promise<void> }) {
  const { t } = useTranslation();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { email, password },
      {
        onError: (err) => {
          setError((err as { message?: string })?.message ?? i18n.t('auth:loginFailed'));
        },
      },
    );
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-secondary/40 px-4 noise-overlay">
      <div className="relative w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8 shadow-lift">
        <h1 className="mb-1 text-center font-display text-3xl font-semibold tracking-tight">
          Taskora
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">{t('auth:loginSubtitle')}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t('auth:email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t('auth:password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? t('auth:loggingIn') : t('auth:login')}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          disabled={login.isPending}
          onClick={() => {
            void onBack().catch((err: Error) => setError(err.message));
          }}
        >
          {t('settings:changeServer', { defaultValue: 'Change server' })}
        </button>
      </div>
    </div>
  );
}
