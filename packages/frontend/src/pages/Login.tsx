import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@taskora/ui/components/ui/button';
import { Input } from '@taskora/ui/components/ui/input';
import { Label } from '@taskora/ui/components/ui/label';
import { REGISTERED_FLAG, useLogin } from '@/lib/hooks/useAuth';

export default function Login() {
  const { t } = useTranslation();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Registration success notice: the register page set a sessionStorage
  // flag right before its full-page redirect here (a toast there would
  // have been torn down by the navigation).
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(REGISTERED_FLAG)) {
        window.sessionStorage.removeItem(REGISTERED_FLAG);
        toast.success(t('auth:registerSuccess'));
      }
    } catch {
      // storage unavailable — skip the notice
    }
  }, [t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate({ email, password }, {
      onError: (err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(
          status === 401
            ? t('auth:loginFailedHint')
            : t('auth:loginFailed'),
        );
      },
    });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary/40 px-4 noise-overlay bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.06),transparent)]">
      <div className="relative w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8 shadow-lift max-md:p-6">
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
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
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
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? t('auth:loggingIn') : t('auth:login')}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth:noAccountPrefix')}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t('auth:register')}
          </Link>
        </p>
      </div>
    </div>
  );
}