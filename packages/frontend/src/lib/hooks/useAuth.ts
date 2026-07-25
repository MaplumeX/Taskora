import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type { LoginDto, RegisterDto } from '@taskora/shared';

import { getMe, login, register } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { toast } from 'sonner';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: LoginDto) => login(data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      navigate('/today');
    },
    onError: (error: unknown) => {
      toast.error('登录失败', {
        description: (error as { message?: string })?.message ?? '请检查邮箱和密码',
      });
    },
  });
}

export function useRegister() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: RegisterDto) => register(data),
    onSuccess: () => {
      toast.success('注册成功', { description: '请登录' });
      navigate('/login');
    },
    onError: (error: unknown) => {
      toast.error('注册失败', {
        description: (error as { message?: string })?.message ?? '该邮箱可能已注册',
      });
    },
  });
}

export function useCurrentUser() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: authKeys.me,
    queryFn: getMe,
    enabled: !!token,
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return () => {
    clear();
    queryClient.clear();
    navigate('/login');
  };
}