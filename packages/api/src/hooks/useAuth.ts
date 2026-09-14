import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { LoginDto, RegisterDto } from '@taskora/shared';

import { getMe, login, register, logout as logoutApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { hydrateFromServer } from '@/stores/preferences.store';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** Host-provided navigation hooks for the auth flow (web routes, desktop shell views). */
export interface AuthFlowNavigation {
  /** Where to go right after a successful login. */
  afterLogin(): void;
  /** Where to go right after a successful registration. */
  afterRegister(): void;
  /** Where to go when the session ended (logout / refresh failure). */
  onLoggedOut(): void;
}

let navigation: AuthFlowNavigation = {
  afterLogin: () => undefined,
  afterRegister: () => undefined,
  onLoggedOut: () => undefined,
};

export function setAuthFlowNavigation(nav: AuthFlowNavigation): void {
  navigation = nav;
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (data: LoginDto) => login(data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user, data.refreshToken);
      hydrateFromServer(data.user.preferences ?? null);
      navigation.afterLogin();
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: RegisterDto) => register(data),
    onSuccess: () => {
      navigation.afterRegister();
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
  return async () => {
    try {
      await logoutApi();
    } catch {
      // tolerate failure — proceed to clear local state
    }
    clear();
    queryClient.clear();
    navigation.onLoggedOut();
  };
}
