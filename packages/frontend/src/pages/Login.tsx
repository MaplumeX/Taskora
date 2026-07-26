import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/lib/hooks/useAuth';

export default function Login() {
  const { t } = useTranslation();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary/40 px-4 noise-overlay">
      <div className="relative w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8 shadow-soft">
        <h1 className="mb-1 text-center text-2xl font-semibold tracking-tight">
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