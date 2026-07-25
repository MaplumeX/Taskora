import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegister } from '@/lib/hooks/useAuth';

export default function Register() {
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
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-semibold tracking-tight">
          创建账号
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">开始使用 Taskora</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">邮箱</Label>
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
            <Label htmlFor="password">密码</Label>
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
            <Label htmlFor="confirm">确认密码</Label>
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
              <p className="text-xs text-destructive">两次输入的密码不一致</p>
            )}
          </div>
          <Button type="submit" disabled={register.isPending || mismatch}>
            {register.isPending ? '注册中…' : '注册'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}