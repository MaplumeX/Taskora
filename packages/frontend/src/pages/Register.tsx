import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegister } from '@/lib/hooks/useAuth';

export default function Register() {
  const { t } = useTranslation();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return;
    register.mutate({ email, password });
  };

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary/40 px-4 noise-overlay bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.06),transparent)]">
      <div className="relative w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8 shadow-lift">
        <h1 className="mb-1 text-center font-display text-3xl font-semibold tracking-tight">
          {t('auth:createAccount')}
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">{t('auth:registerSubtitle')}</p>
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
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">{t('auth:confirmPassword')}</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
            {mismatch && (
              <p className="text-xs text-destructive">{t('auth:passwordMismatch')}</p>
            )}
          </div>
          <Button type="submit" disabled={register.isPending || mismatch}>
            {register.isPending ? t('auth:registering') : t('auth:register')}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth:hasAccountPrefix')}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth:login')}
          </Link>
        </p>
      </div>
    </div>
  );
}