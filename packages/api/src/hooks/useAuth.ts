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
        // Apply the authoritative zone before setAuth wakes the local engine.
        hydrateFromServer(data.user.preferences ?? null);
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
  const userId = useAuthStore((s) => s.user?.id);
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: getMe,
    enabled: !!token,
    refetchInterval: 60_000,
  });

  // Mirror the polled profile into the auth store: the shell avatar and
  // display name read from the store, so a profile edit made on another
  // device must land there too — otherwise it only appears after this
  // device saves the settings form itself. React Query's structural
  // sharing keeps `query.data` referentially stable while the server
  // payload is unchanged, so this does not write on every poll.
  // Preferences rehydrate here too: remote time-zone changes must affect an
  // already-open session, not just the next login.
  useEffect(() => {
    const me = query.data;
    // Require a live session: a cleared store (logout / 401) must not have
    // its cached `me` write a stale user back in before the query clears.
    if (!token || !me?.id || (userId && me.id !== userId)) return;
    hydrateFromServer(me.preferences ?? null);
    setUser({
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      avatarUrl: me.avatarUrl,
      preferences: me.preferences,
    });
  }, [query.data, token, userId, setUser]);

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
