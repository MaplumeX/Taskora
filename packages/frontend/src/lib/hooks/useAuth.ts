import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

import type { LoginDto, RegisterDto } from '@taskora/shared';

import { getMe, login, register, logout as logoutApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { hydrateFromServer } from '@/lib/stores/preferences.store';
import { i18n } from '@/i18n/config';
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
      hydrateFromServer(data.user.preferences ?? null);
      navigate('/today');
    },
    onError: (error: unknown) => {
      toast.error(i18n.t('auth:loginFailed'), {
        description: (error as { message?: string })?.message ?? i18n.t('auth:loginFailedHint'),
      });
    },
  });
}

export function useRegister() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: RegisterDto) => register(data),
    onSuccess: () => {
      toast.success(i18n.t('auth:registerSuccess'), { description: i18n.t('auth:pleaseLogin') });
      navigate('/login');
    },
    onError: (error: unknown) => {
      toast.error(i18n.t('auth:registerFailed'), {
        description: (error as { message?: string })?.message ?? i18n.t('auth:registerFailedHint'),
      });
    },
  });
}

export function useCurrentUser() {
  const token = useAuthStore((s) => s.token);
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: getMe,
    enabled: !!token,
  });

  // Hydrate preferences (theme/language/weekStartsOn) when user identity changes.
  // Only runs when user.id changes (login/switch) to avoid repeated side-effects
  // on staleTime refetches.
  useEffect(() => {
    if (query.data?.id) {
      hydrateFromServer(query.data.preferences ?? null);
    }
  }, [query.data?.id]);

  return query;
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try {
      await logoutApi();
    } catch {
      // tolerate failure — proceed to clear local state
    }
    clear();
    queryClient.clear();
    navigate('/login');
  };
}