import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { withSessionLock } from '@/token-store';

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
    mutationFn: (input: LoginDto) =>
      withSessionLock(async () => {
        const data = await login(input);
        await setAuth(data.accessToken, data.user, data.refreshToken);
        return data;
      }),
    onSuccess: (data) => {
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
      await withSessionLock(async () => {
        try {
          await logoutApi();
        } catch {
          // Offline logout still clears the local session.
        }
        await clear();
      });
      queryClient.clear();
      navigation.onLoggedOut();
    } catch (error) {
      // Do not pretend logout succeeded when the saved session remains.
      toast.error((error as Error).message);
    }
  };
}
